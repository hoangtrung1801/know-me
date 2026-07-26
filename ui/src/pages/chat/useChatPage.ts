import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useChat } from "../../contexts/ChatContext";
import { useConfig } from "../../contexts/ConfigContext";
import { useOpenCode } from "../../contexts/OpenCodeContext";
import { useOpenCodeEvent } from "../../contexts/OpenCodeEventContext";
import { useOpenCodeModelManager } from "../../hooks/useOpencodeModelManager";
import { useSlashItems } from "../../data/skills";
import { useChatNotifications } from "../../hooks/useChatNotifications";
import { playNotificationSound } from "../../lib/notifications";
import { opencodeApi, saveUserPreferences, type OpenCodePendingPermission } from "../../api/client";
import { toast } from "../../components/ui/sonner";
import type { ChatComposerFile, ChatSession } from "../../models/chat";
import {
	buildAutoModelLabel,
	createModelRef,
	getCatalogModelByKey,
	getPickerModels,
	parseModelKey,
} from "../../lib/opencodeModels";
import {
	deriveParentMessageIdFromRawMessages,
	ensureAssistantMessage,
	ensureMessage,
	extractSkillCommands,
	getSessionSortTimestamp,
	getErrorMessage,
	getEventSessionId,
	getLatestChatTodos,
	getSessionErrorText,
	getToolCallOutput,
	getToolCallStatus,
	isQuestionToolName,
	mergeQuestionBlocks,
	mergeSessionList,
	mergeStreamText,
	normalizeOpenCodeMessage,
	normalizeQuestionBlock,
	normalizeQuestionEventBlock,
	stringifyToolOutput,
	toChatSessionFromOpenCodeSession,
	upsertLocalSession,
} from "../../components/organisms/ChatPage/helpers";
import { CHAT_REFERENCE_SYSTEM_PROMPT } from "./constants";
import {
	getSessionIdFromHash,
	getSessionModelsFromStorage,
	isQuestionResolved,
	mergePersistedPendingQuestions,
	readPersistedPendingQuestions,
	removePersistedPendingQuestion,
	saveSessionModelToStorage,
	updatePersistedPendingQuestion,
	updateSessionHash,
	upsertPersistedPendingQuestion,
} from "./storage";

function appendSessionErrorMessage(session: ChatSession, errorMessage: string): ChatSession {
	const nextError = errorMessage.trim() || "Something went wrong";
	const lastMessage = session.messages[session.messages.length - 1];

	if (lastMessage?.role === "assistant" && !lastMessage.content && !lastMessage.reasoning && !(lastMessage.toolCalls?.length) && !(lastMessage.questionBlocks?.length) && !lastMessage.attachments?.length) {
		return {
			...session,
			messages: session.messages.map((message, index) =>
				index === session.messages.length - 1 ? { ...message, error: nextError } : message,
			),
		};
	}

	if (lastMessage?.role === "assistant" && lastMessage.error === nextError) {
		return session;
	}

	return {
		...session,
		messages: [
			...session.messages,
			{
				id: `error_${Date.now()}`,
				role: "assistant",
				content: "",
				model: "",
				createdAt: new Date().toISOString(),
				error: nextError,
			},
		],
	};
}

export function useChatPage() {
	const { sessions, loading } = useChat();
	const { config, updateConfig } = useConfig();
	const { status: opencodeStatus, statusLoading: opencodeStatusLoading, providerResponse, lastLoadedAt, refreshAll, refreshStatus } = useOpenCode();
	const { subscribe: subscribeToOpenCodeEvents } = useOpenCodeEvent();

	const [activeId, setActiveId] = useState<string | null>(null);
	const [localSessions, setLocalSessions] = useState<ChatSession[]>([]);
	const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
	const [previewDocPath, setPreviewDocPath] = useState<string | null>(null);
	const [sessionParentMap, setSessionParentMap] = useState<Record<string, string | undefined>>({});
	const [queueCount, setQueueCount] = useState<Record<string, number>>({});
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [messagesLoading, setMessagesLoading] = useState(false);
	const [inputRestoreValue, setInputRestoreValue] = useState<string | null>(null);
	const [pendingPermissions, setPendingPermissions] = useState<OpenCodePendingPermission[]>([]);
	const activeDirectory = useMemo(
		() => localSessions.find((session) => session.id === activeId)?.directory || null,
		[localSessions, activeId],
	);
	const { slashItems } = useSlashItems(activeDirectory);

	const partKindsRef = useRef<Record<string, string>>({});
	const pendingPartDeltasRef = useRef<Record<string, string>>({});
	const activeIdRef = useRef<string | null>(null);
	const sessionParentMapRef = useRef<Record<string, string | undefined>>({});
	const knownSessionIdsRef = useRef<Set<string>>(new Set());
	const idleTransitionTimersRef = useRef<Record<string, number>>({});
	const streamingWatchdogTimersRef = useRef<Record<string, number>>({});

	// ─── Refresh helpers ───────────────────────────────────────────────────────

	const refreshOpenCodeStatus = useCallback(
		async (options?: { silent?: boolean; fallback?: string }) => {
			const nextStatus = await refreshStatus(options);
			if (!options?.silent && !nextStatus.available) {
				toast.error(nextStatus.error || options?.fallback || "OpenCode is unavailable");
			}
			if (nextStatus.available) {
				await refreshAll({ silent: true });
			}
			return nextStatus;
		},
		[refreshStatus, refreshAll],
	);

	// ─── Sync sessions from context ────────────────────────────────────────────

	useEffect(() => {
		const initialMap: Record<string, string | undefined> = {};
		sessions.forEach((session) => {
			initialMap[session.id] = session.parentSessionId;
		});
		setSessionParentMap(initialMap);

		const storedModels = getSessionModelsFromStorage();
		setLocalSessions(sessions.map((session) => {
			const storedModelKey = storedModels[session.id];
			if (storedModelKey && !session.model) {
				const ref = parseModelKey(storedModelKey);
				if (ref) {
					return { ...session, model: ref, modelSource: "session" as const };
				}
			}
			return session;
		}));
	}, [sessions]);

	// ─── Keep refs in sync ─────────────────────────────────────────────────────

	useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
	useEffect(() => { sessionParentMapRef.current = sessionParentMap; }, [sessionParentMap]);
	useEffect(() => { knownSessionIdsRef.current = new Set(localSessions.map((s) => s.id)); }, [localSessions]);

	// ─── Timer helpers ─────────────────────────────────────────────────────────

	const clearIdleTransition = useCallback((sessionId?: string) => {
		if (!sessionId) return;
		const timer = idleTransitionTimersRef.current[sessionId];
		if (timer) {
			window.clearTimeout(timer);
			delete idleTransitionTimersRef.current[sessionId];
		}
	}, []);

	const scheduleIdleTransition = useCallback((sessionId?: string) => {
		if (!sessionId) return;
		clearIdleTransition(sessionId);
		setLocalSessions((prev) =>
			upsertLocalSession(prev, sessionId, (session) => ({
				...session,
				status: "idle",
				error: undefined,
				updatedAt: new Date().toISOString(),
			})),
		);
	}, [clearIdleTransition]);

	const clearStreamingWatchdog = useCallback((sessionId?: string) => {
		if (!sessionId) return;
		const timer = streamingWatchdogTimersRef.current[sessionId];
		if (timer) {
			window.clearTimeout(timer);
			delete streamingWatchdogTimersRef.current[sessionId];
		}
	}, []);

	const reconcileStreamingSession = useCallback(async (sessionId: string) => {
		try {
			const [sessionInfo, rawMessages] = await Promise.all([
				opencodeApi.getSession(sessionId),
				opencodeApi.getMessages(sessionId),
			]);
			const normalizedMessages = mergePersistedPendingQuestions(
				rawMessages.map(normalizeOpenCodeMessage),
				readPersistedPendingQuestions(sessionId),
			);
			const parentMessageId = deriveParentMessageIdFromRawMessages(rawMessages);
			const latestMessage = rawMessages[rawMessages.length - 1];
			const isCompletedAssistantTurn =
				latestMessage?.info?.role === "assistant" && typeof latestMessage.info?.time?.completed === "number";

			setLocalSessions((prev) =>
				upsertLocalSession(prev, sessionId, (session) => ({
					...session,
					title: sessionInfo.title || session.title,
					parentSessionId: sessionInfo.parentID || session.parentSessionId,
					updatedAt: new Date(sessionInfo.time?.updated || Date.now()).toISOString(),
					messages: normalizedMessages.length > 0 ? normalizedMessages : session.messages,
					parentMessageId: parentMessageId || session.parentMessageId,
					status: isCompletedAssistantTurn ? "idle" : session.status,
					error: isCompletedAssistantTurn ? undefined : session.error,
				})),
			);
			setSessionParentMap((prev) => ({ ...prev, [sessionId]: sessionInfo.parentID || undefined }));

			if (isCompletedAssistantTurn) {
				clearIdleTransition(sessionId);
				clearStreamingWatchdog(sessionId);
				return;
			}

			streamingWatchdogTimersRef.current[sessionId] = window.setTimeout(() => {
				void reconcileStreamingSession(sessionId);
			}, 8000);
		} catch (error) {
			console.error("Failed to reconcile streaming session:", error);
			streamingWatchdogTimersRef.current[sessionId] = window.setTimeout(() => {
				void reconcileStreamingSession(sessionId);
			}, 8000);
		}
	}, [clearIdleTransition, clearStreamingWatchdog]);

	const scheduleStreamingWatchdog = useCallback((sessionId?: string) => {
		if (!sessionId) return;
		clearStreamingWatchdog(sessionId);
		streamingWatchdogTimersRef.current[sessionId] = window.setTimeout(() => {
			void reconcileStreamingSession(sessionId);
		}, 8000);
	}, [clearStreamingWatchdog, reconcileStreamingSession]);

	useEffect(() => {
		return () => {
			Object.values(idleTransitionTimersRef.current).forEach((timer) => window.clearTimeout(timer));
			idleTransitionTimersRef.current = {};
			Object.values(streamingWatchdogTimersRef.current).forEach((timer) => window.clearTimeout(timer));
			streamingWatchdogTimersRef.current = {};
		};
	}, []);

	// ─── Model manager ─────────────────────────────────────────────────────────

	const { modelCatalog: catalog, modelSettings, updateModelPref, toggleProviderHidden, setDefaultModel, setDefaultVariant } = useOpenCodeModelManager({
		settings: config.opencodeModels,
		providerResponse,
		status: opencodeStatus,
		lastLoadedAt,
		onChange: async (nextSettings) => {
			await saveUserPreferences({ opencodeModels: nextSettings });
			await updateConfig({ opencodeModels: nextSettings });
		},
	});
	const pickerProviders = useMemo(() => getPickerModels(catalog), [catalog]);
	const autoModelLabel = useMemo(() => buildAutoModelLabel(catalog), [catalog]);

	// ─── Session lists ─────────────────────────────────────────────────────────

	const rootSessions = useMemo(
		() =>
			localSessions
				.filter((session) => !sessionParentMap[session.id])
				.sort((l, r) => getSessionSortTimestamp(r) - getSessionSortTimestamp(l)),
		[localSessions, sessionParentMap],
	);

	const activeSubSessions = useMemo(
		() =>
			localSessions
				.filter((session) => sessionParentMap[session.id] === activeId)
				.sort((l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime()),
		[localSessions, sessionParentMap, activeId],
	);

	const activeSubSessionIds = useMemo(
		() => activeSubSessions.map((s) => s.id).sort().join(","),
		[activeSubSessions],
	);

	const sessionActivity = useMemo(() => {
		const activity: Record<
			string,
			{ isRunning: boolean; runningAgents: number; hasError: boolean; hasPendingPermission: boolean; hasPendingQuestion: boolean }
		> = {};
		rootSessions.forEach((rootSession) => {
			const childSessions = localSessions.filter((session) => sessionParentMap[session.id] === rootSession.id);
			const runningAgents = childSessions.filter((session) => session.status === "streaming").length;
			const hasPendingPermission = pendingPermissions.some((p) => p.sessionID === rootSession.id);
			const hasPendingQuestion = rootSession.messages.some((msg) =>
				msg.questionBlocks?.some((block) => !isQuestionResolved(block)),
			);
			activity[rootSession.id] = {
				isRunning: rootSession.status === "streaming" || runningAgents > 0,
				runningAgents,
				hasError: rootSession.status === "error" || childSessions.some((session) => session.status === "error"),
				hasPendingPermission,
				hasPendingQuestion,
			};
		});
		return activity;
	}, [localSessions, rootSessions, sessionParentMap, pendingPermissions]);

	// ─── Active session selection ──────────────────────────────────────────────

	useEffect(() => {
		const fromHash = getSessionIdFromHash();
		if (!activeId && fromHash && rootSessions.some((s) => s.id === fromHash)) {
			setActiveId(fromHash);
			return;
		}
		if (!activeId && rootSessions.length > 0) {
			setActiveId(rootSessions[0]?.id || null);
			return;
		}
		if (activeId && !rootSessions.some((s) => s.id === activeId)) {
			setActiveId(rootSessions[0]?.id || null);
		}
	}, [rootSessions, activeId]);

	useEffect(() => {
		const syncSessionFromLocation = () => {
			const nextId = getSessionIdFromHash();
			if (nextId && rootSessions.some((s) => s.id === nextId)) {
				setActiveId(nextId);
			}
		};
		window.addEventListener("popstate", syncSessionFromLocation);
		window.addEventListener("hashchange", syncSessionFromLocation);
		return () => {
			window.removeEventListener("popstate", syncSessionFromLocation);
			window.removeEventListener("hashchange", syncSessionFromLocation);
		};
	}, [rootSessions]);

	useEffect(() => {
		if (activeId) updateSessionHash(activeId);
	}, [activeId]);

	// ─── Load messages on session switch ──────────────────────────────────────

	useEffect(() => {
		if (!activeId || !opencodeStatus?.available) return;
		partKindsRef.current = {};
		pendingPartDeltasRef.current = {};
		setMessagesLoading(true);

		const loadMessagesForSession = async (sessionId: string) => {
			const [rawMessages, pendingQuestions, permissions] = await Promise.all([
				opencodeApi.getMessages(sessionId),
				opencodeApi.listPendingQuestions().catch(() => []),
				opencodeApi.listPendingPermissions().catch(() => []),
			]);
			let messages = rawMessages.map(normalizeOpenCodeMessage);
			// Merge server-side pending questions (have correct que_... IDs)
			const sessionQuestions = pendingQuestions.filter((pq) => pq.sessionID === sessionId);
			for (const pq of sessionQuestions) {
				const qblock = normalizeQuestionEventBlock(pq.id, pq.questions);
				if (!qblock) continue;
				messages = messages.map((msg) => {
					if (msg.id !== pq.tool.messageID) return msg;
					return { ...msg, questionBlocks: mergeQuestionBlocks(msg.questionBlocks, qblock) };
				});
			}
			messages = mergePersistedPendingQuestions(messages, readPersistedPendingQuestions(sessionId));
			return { sessionId, messages, parentMessageId: deriveParentMessageIdFromRawMessages(rawMessages), permissions };
		};

		const loadMessages = async () => {
			try {
				const sessionIds = [activeId, ...activeSubSessionIds.split(",").filter(Boolean)];
				const loaded = await Promise.all(sessionIds.map((id) => loadMessagesForSession(id)));
				setLocalSessions((prev) =>
					prev.map((session) => {
						const match = loaded.find((item) => item.sessionId === session.id);
						if (!match) return session;
						return {
							...session,
							messages: match.messages,
							parentMessageId: match.parentMessageId || session.parentMessageId,
						};
					}),
				);
				// Aggregate all permissions from loaded sessions
				const allPermissions = loaded.flatMap((item) => item.permissions || []);
				setPendingPermissions(allPermissions);
			} catch (error) {
				console.error("Failed to load OpenCode messages:", error);
			} finally {
				setMessagesLoading(false);
			}
		};

		void loadMessages();
	}, [activeId, activeSubSessionIds, opencodeStatus?.available]);

	// ─── SSE event stream ──────────────────────────────────────────────────────
	// Uses the shared OpenCodeEventContext singleton instead of a per-component
	// EventSource, so no additional SSE connection is opened here.

	useEffect(() => {
		if (!opencodeStatus?.available) return;

		const shouldTrackSessionId = (sessionId?: string) => {
			if (!sessionId) return false;
			if (sessionId === activeIdRef.current) return true;
			if (sessionParentMapRef.current[sessionId] === activeIdRef.current) return true;
			return knownSessionIdsRef.current.has(sessionId);
		};

		const unsubscribe = subscribeToOpenCodeEvents((rawEvent: unknown) => {
			try {
				const data = rawEvent as Record<string, any>;
						const sessionID = getEventSessionId(data);
						const part = data.properties?.part;

						if (data.type === "session.updated" && data.properties?.info?.id) {
							const info = data.properties.info;
							clearIdleTransition(info.id);
							scheduleStreamingWatchdog(info.id);
							const incoming = {
								...toChatSessionFromOpenCodeSession(info),
								title: info.title || "New Chat",
								updatedAt: new Date(info.time?.updated || Date.now()).toISOString(),
							};
							setLocalSessions((prev) => mergeSessionList(prev, [incoming]));
							// Update refs synchronously so subsequent SSE events for this session
							// pass shouldTrackSessionId before the next React render cycle
							sessionParentMapRef.current = { ...sessionParentMapRef.current, [info.id]: info.parentID || undefined };
							knownSessionIdsRef.current.add(info.id);
							setSessionParentMap((prev) => ({ ...prev, [info.id]: info.parentID || undefined }));
						}

						if ((data.type === "message.updated" || data.type === "message.created") && data.properties?.info) {
							const info = data.properties.info;
							if (!shouldTrackSessionId(info.sessionID)) return;
							clearIdleTransition(info.sessionID);
							scheduleStreamingWatchdog(info.sessionID);
							const createdAt = info.time?.created ? new Date(info.time.created).toISOString() : new Date().toISOString();

							setLocalSessions((prev) =>
								upsertLocalSession(prev, info.sessionID, (session) => {
									const nextModel = info.providerID && info.modelID ? createModelRef(info.providerID, info.modelID) : session.model;
									const nextSessionBase: ChatSession = {
										...session,
										model: nextModel,
										modelSource: nextModel ? session.modelSource || "session" : session.modelSource,
										updatedAt: new Date(info.time?.created || Date.now()).toISOString(),
										providerID: info.providerID || session.providerID,
										mode: info.mode || session.mode,
										agent: info.agent || session.agent,
										parentMessageId: info.parentID || session.parentMessageId,
									};

									if (info.role === "user") {
										const ensured = ensureMessage(session.messages, {
											messageId: info.id,
											role: "user",
											createdAt,
											model: info.modelID || undefined,
											parentMessageId: info.parentID || undefined,
										});
										return { ...nextSessionBase, messages: ensured.messages, status: session.status, error: undefined };
									}

									if (info.role === "assistant") {
										const ensured = ensureAssistantMessage(session.messages, {
											messageId: info.id,
											createdAt,
											model: info.modelID || undefined,
											parentMessageId: info.parentID || undefined,
										});
										const messages = [...ensured.messages];
										const message = messages[ensured.index];
										if (!message) return nextSessionBase;
										messages[ensured.index] = {
											...message,
											model: info.modelID || message.model,
											tokens: info.tokens?.total ?? message.tokens,
											inputTokens: info.tokens?.input ?? message.inputTokens,
											outputTokens: info.tokens?.output ?? message.outputTokens,
											cost: typeof info.cost === "number" ? info.cost : message.cost,
											duration: info.time?.created && info.time?.completed
												? info.time.completed - info.time.created
												: message.duration,
										};
										return { ...nextSessionBase, status: session.status === "error" ? "error" : "streaming", error: undefined, messages };
									}

									return nextSessionBase;
								}),
							);
						}

						if (data.type === "message.part.delta" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							clearIdleTransition(sessionID);
							scheduleStreamingWatchdog(sessionID);
							const { messageID, partID, delta } = data.properties || {};
							const partKind = partKindsRef.current[partID];
							if (typeof delta !== "string" || !messageID) return;
							if (!partKind) {
								pendingPartDeltasRef.current[partID] = `${pendingPartDeltasRef.current[partID] || ""}${delta}`;
								return;
							}

							setLocalSessions((prev) =>
								upsertLocalSession(prev, sessionID, (session) => {
									const ensured = ensureAssistantMessage(session.messages, { messageId: messageID });
									const messages = [...ensured.messages];
									const message = messages[ensured.index];
									if (!message) return session;
									messages[ensured.index] = {
										...message,
										content: partKind === "text" ? `${message.content || ""}${delta}` : message.content,
										reasoning: partKind === "reasoning" ? `${message.reasoning || ""}${delta}` : message.reasoning,
									};
									return { ...session, status: "streaming", error: undefined, messages };
								}),
							);
						}

						if (data.type === "message.part.updated" && part?.sessionID) {
							if (!shouldTrackSessionId(part.sessionID)) return;
							clearIdleTransition(part.sessionID);
							scheduleStreamingWatchdog(part.sessionID);
							partKindsRef.current[part.id] = part.type;
							const bufferedDelta = pendingPartDeltasRef.current[part.id] || "";
							delete pendingPartDeltasRef.current[part.id];

							// If this is a pending question tool call, fetch the proper que_... ID outside setState
							if (part.type === "tool" && isQuestionToolName(part.tool || "tool") && getToolCallStatus(part.state) !== "success") {
								void opencodeApi.listPendingQuestions().then((pendingQuestions) => {
									const sessionQuestions = pendingQuestions.filter((pq) => pq.sessionID === part.sessionID);
									if (sessionQuestions.length === 0) return;
									setLocalSessions((prev) =>
										upsertLocalSession(prev, part.sessionID, (s) => {
											let msgs = [...s.messages];
											for (const pq of sessionQuestions) {
												const qblock = normalizeQuestionEventBlock(pq.id, pq.questions);
												if (!qblock) continue;
												msgs = msgs.map((msg) => {
													if (msg.id !== pq.tool.messageID) return msg;
													return { ...msg, questionBlocks: mergeQuestionBlocks(msg.questionBlocks, qblock) };
												});
											}
											return { ...s, messages: msgs, status: "idle" };
										}),
									);
								}).catch(() => undefined);
							}

							setLocalSessions((prev) =>
								upsertLocalSession(prev, part.sessionID, (session) => {
									if (part.type === "step-start") {
										const ensured = ensureAssistantMessage(session.messages, {
											messageId: part.messageID,
											createdAt: new Date().toISOString(),
										});
										return { ...session, messages: ensured.messages, status: "streaming", error: undefined };
									}

									if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
										const messageIndex = session.messages.findIndex((m) => m.id === part.messageID);
										if (messageIndex < 0) return session;
										const messages = [...session.messages];
										const existing = messages[messageIndex];
										if (!existing) return session;
										messages[messageIndex] = {
											...existing,
											content: part.type === "text" ? mergeStreamText(existing.content, part.text, bufferedDelta) : existing.content,
											reasoning: part.type === "reasoning" ? mergeStreamText(existing.reasoning, part.text, bufferedDelta) : existing.reasoning,
										};
										return { ...session, messages, status: "streaming", error: undefined };
									}

									if (part.type === "tool") {
										const toolStatus = getToolCallStatus(part.state);
										if (isQuestionToolName(part.tool || "tool") && toolStatus !== "success") {
											// Skip — questionBlock injected via the async fetch above
											return { ...session, status: "streaming", error: undefined };
										}
										const ensured = ensureAssistantMessage(session.messages, { messageId: part.messageID });
										const messages = [...ensured.messages];
										const message = messages[ensured.index];
										if (!message) return session;
										const existingToolCalls = message.toolCalls || [];
										const callID = part.callID;
										const toolIndex = callID ? existingToolCalls.findIndex((t) => t.id === callID) : -1;
										const toolCallOutput = getToolCallOutput(part.state);
										const toolCall = {
											id: callID || `tool_${existingToolCalls.length}`,
											name: part.tool || "tool",
											input: typeof part.state?.input === "object" && part.state?.input ? part.state.input : {},
											output: toolCallOutput,
											status: toolStatus,
											title: typeof part.state?.title === "string" ? part.state.title : undefined,
											metadata: part.state?.metadata && typeof part.state.metadata === "object"
												? (part.state.metadata as Record<string, unknown>)
												: undefined,
										};
										const toolCalls = [...existingToolCalls];
										if (toolIndex >= 0) {
											const existingTool = toolCalls[toolIndex]!;
											toolCalls[toolIndex] = { ...existingTool, ...toolCall, input: toolCall.input || existingTool.input };
										} else {
											toolCalls.push(toolCall);
										}
										messages[ensured.index] = { ...message, toolCalls };
										return { ...session, messages, status: "streaming", error: undefined };
									}

									if (part.type === "question") {
										const questionBlock = normalizeQuestionBlock(part);
										if (!questionBlock) return session;
										const ensured = ensureAssistantMessage(session.messages, { messageId: part.messageID });
										const messages = [...ensured.messages];
										const message = messages[ensured.index];
										if (!message) return session;
										messages[ensured.index] = {
											...message,
											questionBlocks: mergeQuestionBlocks(message.questionBlocks, questionBlock),
										};
										return { ...session, messages, status: "idle", error: undefined, updatedAt: new Date().toISOString() };
									}

									if (part.type === "step-finish") {
										const ensured = ensureAssistantMessage(session.messages, { messageId: part.messageID });
										const messages = [...ensured.messages];
										const message = messages[ensured.index];
										if (!message) return session;
										messages[ensured.index] = {
											...message,
											tokens: part.tokens?.total ?? message.tokens,
											inputTokens: part.tokens?.input ?? message.inputTokens,
											outputTokens: part.tokens?.output ?? message.outputTokens,
											cost: typeof part.cost === "number" ? part.cost : message.cost,
										};
										return { ...session, status: session.status, error: undefined, messages };
									}

									return session;
								}),
							);
						}

						if (data.type === "question.asked" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							// OpenCode may use "id" or "requestID" depending on version
							const questionId = data.properties?.id ?? data.properties?.requestID;
							const questions = data.properties?.questions;
							// messageID may be nested differently depending on version
							const messageId =
								data.properties?.tool?.messageID ||
								data.properties?.messageID ||
								data.properties?.message_id;
							if (typeof questionId !== "string") return;
							const questionBlock = normalizeQuestionEventBlock(questionId, questions);
							if (!questionBlock) return;
							clearIdleTransition(sessionID);
							clearStreamingWatchdog(sessionID);
							setLocalSessions((prev) => {
								const updated = upsertLocalSession(prev, sessionID, (session) => {
									// Fallback to last assistant message if messageId is missing
									const resolvedMessageId =
										typeof messageId === "string" && messageId
											? messageId
											: [...session.messages].reverse().find((m) => m.role === "assistant")?.id;
									if (!resolvedMessageId) return session;
									const ensured = ensureAssistantMessage(session.messages, { messageId: resolvedMessageId });
									upsertPersistedPendingQuestion(sessionID, resolvedMessageId, questionBlock);
									const messages = [...ensured.messages];
									const message = messages[ensured.index];
									if (!message) return session;
									messages[ensured.index] = {
										...message,
										questionBlocks: mergeQuestionBlocks(message.questionBlocks, questionBlock),
									};
									return { ...session, messages, status: "idle", error: undefined, updatedAt: new Date().toISOString() };
								});
								// Notify if question is from a different session
								if (sessionID !== activeIdRef.current) {
									const session = updated.find((s) => s.id === sessionID);
									const sessionTitle = session?.title || "Another session";
									toast(`${sessionTitle} needs your answer`, {
										description: questionBlock.prompts[0]?.question,
										action: {
											label: "Switch",
											onClick: () => setActiveId(sessionID),
										},
										duration: 0,
									});
									playNotificationSound("attention");
								}
								return updated;
							});
						}

						if (data.type === "question.replied" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							const questionId = data.properties?.requestID;
							const answers = data.properties?.answers;
							if (typeof questionId !== "string") return;
							removePersistedPendingQuestion(sessionID, questionId);
							clearIdleTransition(sessionID);
							scheduleStreamingWatchdog(sessionID);
							setLocalSessions((prev) =>
								upsertLocalSession(prev, sessionID, (session) => ({
									...session,
									status: "streaming",
									error: undefined,
									messages: session.messages.map((message) => ({
										...message,
										questionBlocks: (message.questionBlocks || []).map((block) =>
											block.id === questionId
												? { ...block, selectedAnswers: Array.isArray(answers) ? (answers as string[][]) : block.selectedAnswers, status: "submitted", error: undefined }
												: block,
										),
									})),
								})),
							);
						}

						if (data.type === "permission.asked" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							const permission = data.properties as OpenCodePendingPermission | undefined;
							if (!permission?.id) return;
							clearIdleTransition(sessionID);
							clearStreamingWatchdog(sessionID);
							setPendingPermissions((prev) => {
								const next = prev.filter((item) => item.id !== permission.id);
								next.push(permission);
								return next;
							});
							setLocalSessions((prev) =>
								upsertLocalSession(prev, sessionID, (session) => ({
									...session,
									status: "idle",
									error: undefined,
									updatedAt: new Date().toISOString(),
								})),
							);
						}

						if (data.type === "session.status" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							const { status } = data.properties || {};
							if (status.type === "idle") {
								clearStreamingWatchdog(sessionID);
								scheduleIdleTransition(sessionID);
							} else if (status.type === "retry") {
								clearIdleTransition(sessionID);
								clearStreamingWatchdog(sessionID);
								const retryMessage = typeof status.message === "string" && status.message.trim().length > 0
									? status.message
									: `Retrying (attempt ${typeof status.attempt === "number" ? status.attempt : 1})`;
								setLocalSessions((prev) =>
									upsertLocalSession(prev, sessionID, (session) => ({
										...appendSessionErrorMessage(session, retryMessage),
										status: "error",
										error: retryMessage,
										updatedAt: new Date().toISOString(),
									})),
								);
							} else {
								clearIdleTransition(sessionID);
								scheduleStreamingWatchdog(sessionID);
								setLocalSessions((prev) =>
									upsertLocalSession(prev, sessionID, (session) => ({ ...session, status: "streaming", error: undefined })),
								);
							}
						}

						if (data.type === "session.idle" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							clearStreamingWatchdog(sessionID);
							scheduleIdleTransition(sessionID);
						}

						if (data.type === "session.error" && sessionID) {
							if (!shouldTrackSessionId(sessionID)) return;
							clearIdleTransition(sessionID);
							clearStreamingWatchdog(sessionID);
							const message = getSessionErrorText(data.properties?.error);
						setLocalSessions((prev) =>
							upsertLocalSession(prev, sessionID, (session) => ({
								...appendSessionErrorMessage(session, message),
								status: "error",
								error: message,
								updatedAt: new Date().toISOString(),
							})),
						);
					}
					} catch (error) {
						console.error("Failed to parse OpenCode event:", error);
					}
			});

		return unsubscribe;
	}, [clearIdleTransition, clearStreamingWatchdog, opencodeStatus?.available, scheduleIdleTransition, scheduleStreamingWatchdog, subscribeToOpenCodeEvents]);

	// ─── Derived state ─────────────────────────────────────────────────────────

	const activeSession = localSessions.find((s) => s.id === activeId) || null;
	const activeSessionTodos = useMemo(() => getLatestChatTodos(activeSession), [activeSession]);

	const activeQuestion = useMemo(() => {
		if (!activeSession) return null;
		// Primary: check questionBlocks on messages
		for (let mi = activeSession.messages.length - 1; mi >= 0; mi -= 1) {
			const message = activeSession.messages[mi];
			if (!message?.questionBlocks?.length) continue;
			for (let bi = message.questionBlocks.length - 1; bi >= 0; bi -= 1) {
				const block = message.questionBlocks[bi];
				if (block && !isQuestionResolved(block)) return { messageId: message.id, block };
			}
		}

		return null;
	}, [activeSession]);

	const activePermission = useMemo(() => {
		if (!activeSession) return null;
		return pendingPermissions.find((p) => p.sessionID === activeSession.id) || null;
	}, [activeSession, pendingPermissions]);

	const activeQuickCommands = useMemo(() => {
		if (!activeSession || activeSession.status === "streaming") return [];
		const lastMessage = activeSession.messages[activeSession.messages.length - 1];
		if (!lastMessage || lastMessage.role !== "assistant") return [];
		return extractSkillCommands(lastMessage.content);
	}, [activeSession]);

	const opencodeBlockedReason =
		!opencodeStatusLoading && opencodeStatus && opencodeStatus.configured && !opencodeStatus.available
			? opencodeStatus.error || "OpenCode is unavailable."
			: null;
	const chatDisabled = opencodeStatusLoading || Boolean(opencodeBlockedReason);

	useEffect(() => {
		document.title = activeSession ? `${activeSession.title || "New Chat"} - Knowns` : "Knowns";
	}, [activeSession]);

	// ─── Notifications ─────────────────────────────────────────────────────────

	useChatNotifications({
		sessionTitle: activeSession?.title || "New Chat",
		pendingQuestions: activeQuestion ? 1 : 0,
		pendingPermissions: activePermission ? 1 : 0,
		isStreaming: activeSession?.status === "streaming",
		status: activeSession?.status === "streaming" 
			? "streaming" 
			: activeSession?.status === "error" 
				? "error"
				: activeSession?.status === "idle"
					? "done"
					: "idle",
	});

	// ─── Handlers ──────────────────────────────────────────────────────────────

	const handleSelectSession = useCallback((sessionId: string) => {
		setActiveId(sessionId);
		updateSessionHash(sessionId);
	}, []);

	const handleNewChat = async () => {
		try {
			const defaultModel = catalog.effectiveDefault;
			const modelSource: ChatSession["modelSource"] = defaultModel
				? catalog.projectDefault?.key === defaultModel.key
					? "project-default"
					: catalog.apiDefault?.key === defaultModel.key
						? "opencode-default"
						: "auto"
				: "auto";
			const session = await opencodeApi.createSession(
				defaultModel ? { model: { providerID: defaultModel.providerID, modelID: defaultModel.modelID } } : undefined,
			);
			const nextSession = { ...toChatSessionFromOpenCodeSession(session), model: defaultModel, modelSource };
			setLocalSessions((prev) => mergeSessionList(prev, [nextSession]));
			setActiveId(nextSession.id);
			updateSessionHash(nextSession.id);
		} catch (error) {
			console.error("Failed to create session:", error);
			await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to create OpenCode session") });
		}
	};

	const handleDelete = async (id: string) => {
		if (chatDisabled) {
			toast.error(opencodeBlockedReason || "OpenCode is unavailable");
			return;
		}
		try {
			await opencodeApi.deleteSession(id);
		} catch (error) {
			console.error("Failed to delete session:", error);
			await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to delete OpenCode session") });
			return;
		}

		setSessionParentMap((prev) => {
			const next = { ...prev };
			Object.keys(next).forEach((key) => {
				if (key === id || next[key] === id) delete next[key];
			});
			return next;
		});
		setLocalSessions((prev) => prev.filter((s) => s.id !== id && s.parentSessionId !== id));
		if (activeId === id) {
			const nextActive = rootSessions.find((s) => s.id !== id)?.id || null;
			setActiveId(nextActive);
			updateSessionHash(nextActive);
		}
	};

	const handleRename = async (id: string, title: string) => {
		setLocalSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
		try {
			await opencodeApi.updateSession(id, { title });
		} catch (error) {
			console.error("Failed to rename session:", error);
			await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to update OpenCode session") });
		}
	};

	const handleModelChange = async (modelKey: string | null, variant?: string | null) => {
		if (!activeId || chatDisabled) {
			if (chatDisabled) toast.error(opencodeBlockedReason || "OpenCode is unavailable");
			return;
		}
		try {
			const model = getCatalogModelByKey(catalog, modelKey);
			const payload = model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {};
			await opencodeApi.updateSession(activeId, payload);
			saveSessionModelToStorage(activeId, modelKey);
			setLocalSessions((prev) =>
				prev.map((session) =>
					session.id === activeId
						? {
								...session,
								model: model ? createModelRef(model.providerID, model.modelID) : null,
								modelSource: model ? "session" : "auto",
								providerID: model?.providerID || session.providerID,
							}
						: session,
				),
			);
		} catch (error) {
			console.error("Failed to update model:", error);
			await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to update OpenCode model") });
		}
	};

	const handleSend = async (content: string, files: ChatComposerFile[] = []) => {
		if (!activeId || chatDisabled) {
			if (chatDisabled) toast.error(opencodeBlockedReason || "OpenCode is unavailable");
			return;
		}

		const session = localSessions.find((item) => item.id === activeId);
		const trimmedContent = content.trim();
		const slashMatch = trimmedContent.match(/^\/(?<name>[^\s]+)(?:\s+(?<arguments>[\s\S]*))?$/);
		const slashName = slashMatch?.groups?.name?.toLowerCase();
		const slashCommand = slashName
			? slashItems.find(
				(item) => item.source === "command" && item.name.toLowerCase() === `/${slashName}`,
			)
			: undefined;
		const isCompactCommand = slashCommand?.name.toLowerCase() === "/compact";
		const isStreaming = session?.status === "streaming";
		const commandModelSelection = session?.model
			? { providerID: session.model.providerID, modelID: session.model.modelID }
			: catalog.effectiveDefault
				? { providerID: catalog.effectiveDefault.providerID, modelID: catalog.effectiveDefault.modelID }
				: undefined;
		const commandModel = commandModelSelection
			? `${commandModelSelection.providerID}/${commandModelSelection.modelID}`
			: undefined;

		if (slashCommand) {
			if (files.length > 0) {
				toast.error("Slash commands do not support image attachments.");
				return;
			}
			if (isStreaming) {
				toast.error("Wait for the current response to finish before running a slash command.");
				return;
			}

			try {
				if (isCompactCommand && !commandModelSelection) {
					toast.error("Select a model before using /compact.");
					return;
				}

				const userMessage = {
					id: `temp_cmd_${Date.now()}`,
					role: "user" as const,
					content: trimmedContent,
					model: session?.model?.modelID || "",
					createdAt: new Date().toISOString(),
				};

				setLocalSessions((prev) =>
					prev.map((s) =>
							s.id === activeId
								? {
								...s,
								messages: [...s.messages, userMessage],
								status: isCompactCommand ? "streaming" : "idle",
								error: undefined,
							}
							: s,
					),
				);

				if (isCompactCommand) {
					const summarizeModel = commandModelSelection!;
					clearIdleTransition(activeId);
					scheduleStreamingWatchdog(activeId);
					await opencodeApi.summarizeSession(activeId, summarizeModel, session?.directory || activeDirectory);
					window.setTimeout(() => {
						void reconcileStreamingSession(activeId);
					}, 300);
					return;
				}

				await opencodeApi.runCommand(activeId, {
					command: slashMatch?.groups?.name || slashCommand.name.replace(/^\//, ""),
					arguments: slashMatch?.groups?.arguments || "",
					agent: session?.agent || "build",
					model: commandModel,
					directory: session?.directory || activeDirectory,
					parts: [],
				});

				window.setTimeout(() => {
					void reconcileStreamingSession(activeId);
				}, 300);
				return;
			} catch (error) {
				console.error("Failed to run slash command:", error);
				clearStreamingWatchdog(activeId);
				setLocalSessions((prev) =>
					prev.map((s) =>
						s.id === activeId
							? {
								...s,
								status: "idle",
								messages: s.messages.filter((message) => !message.id.startsWith("temp_cmd_")),
							}
							: s,
					),
				);
				toast.error(getErrorMessage(error, `Failed to run ${slashCommand.name}`));
				return;
			}
		}

		if (isStreaming) {
			try {
				const result = await opencodeApi.sendMessage(activeId, trimmedContent);
				if (result && "queueSize" in result) {
					setQueueCount((prev) => ({ ...prev, [activeId]: result.queueSize as number }));
				}
				return;
			} catch (error) {
				console.error("Failed to queue message:", error);
				toast.error(getErrorMessage(error, "Failed to queue message"));
				return;
			}
		}

		try {
			clearIdleTransition(activeId);
			scheduleStreamingWatchdog(activeId);
			const userMessage = {
				id: `temp_${Date.now()}`,
				role: "user" as const,
				content: trimmedContent,
				model: "",
				createdAt: new Date().toISOString(),
				attachments: files.length > 0
					? files.map((file) => ({ id: file.id, mime: file.mime, url: file.url, filename: file.filename }))
					: undefined,
			};

			setLocalSessions((prev) =>
				prev.map((s) =>
					s.id === activeId
						? { ...s, messages: [...s.messages, userMessage], status: "streaming", error: undefined }
						: s,
				),
			);

			const modelSelection = session?.model
				? { providerID: session.model.providerID, modelID: session.model.modelID }
				: undefined;
			const modelKey = session?.model?.key;
			const variant = modelKey ? modelSettings.variantModels?.[modelKey] || undefined : undefined;

			const parts = [
				...(trimmedContent ? [{ type: "text" as const, text: trimmedContent }] : []),
				...files.map((file) => ({ type: "file" as const, mime: file.mime, url: file.url, filename: file.filename })),
			];
			await opencodeApi.sendMessageAsync(activeId, parts, modelSelection, CHAT_REFERENCE_SYSTEM_PROMPT, variant);
		} catch (error) {
			console.error("Failed to send message:", error);
			const message = getErrorMessage(error, "Failed to send message to OpenCode");
			clearStreamingWatchdog(activeId);
			setLocalSessions((prev) =>
				prev.map((s) =>
					s.id === activeId
						? { ...appendSessionErrorMessage(s, message), status: "idle", error: message, updatedAt: new Date().toISOString() }
						: s,
				),
			);
			await refreshOpenCodeStatus({ silent: true, fallback: message });
		}
	};

	const handleSubmitQuestion = useCallback(
		async (messageId: string, blockId: string, answers: string[][]) => {
			if (!activeId) return;
			setLocalSessions((prev) =>
				upsertLocalSession(prev, activeId, (session) => ({
					...session,
					messages: session.messages.map((message) => {
						if (message.id !== messageId) return message;
						return {
							...message,
							questionBlocks: (message.questionBlocks || []).map((block) =>
								block.id === blockId ? { ...block, selectedAnswers: answers, status: "submitting", error: undefined } : block,
							),
						};
					}),
				})),
			);
			updatePersistedPendingQuestion(activeId, blockId, (entry) => ({
				...entry,
				block: { ...entry.block, selectedAnswers: answers, status: "submitting", error: undefined },
			}));

			try {
				await opencodeApi.replyQuestion(blockId, { answers });
				removePersistedPendingQuestion(activeId, blockId);
				scheduleStreamingWatchdog(activeId);
				setLocalSessions((prev) =>
					upsertLocalSession(prev, activeId, (session) => ({
						...session,
						status: "streaming",
						error: undefined,
						messages: session.messages.map((message) => {
							if (message.id !== messageId) return message;
							return {
								...message,
								questionBlocks: (message.questionBlocks || []).map((block) =>
									block.id === blockId ? { ...block, selectedAnswers: answers, status: "submitted", error: undefined } : block,
								),
							};
						}),
					})),
				);
			} catch (error) {
				const message = getErrorMessage(error, "Failed to reply to question");
				setLocalSessions((prev) =>
					upsertLocalSession(prev, activeId, (session) => ({
						...session,
						messages: session.messages.map((item) => {
							if (item.id !== messageId) return item;
							return {
								...item,
								questionBlocks: (item.questionBlocks || []).map((block) =>
									block.id === blockId ? { ...block, selectedAnswers: answers, status: "error", error: message } : block,
								),
							};
						}),
					})),
				);
			}
		},
		[activeId, scheduleStreamingWatchdog],
	);

	const handleRespondPermission = useCallback(
		async (permissionId: string, response: "once" | "always" | "reject") => {
			if (!activeId) return;
			try {
				await opencodeApi.respondToPermission(activeId, permissionId, { response });
				setPendingPermissions((prev) => prev.filter((p) => p.id !== permissionId));
				if (response !== "reject") {
					scheduleStreamingWatchdog(activeId);
					setLocalSessions((prev) =>
						upsertLocalSession(prev, activeId, (session) => ({ ...session, status: "streaming" })),
					);
				}
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to respond to permission"));
			}
		},
		[activeId, scheduleStreamingWatchdog],
	);

	const handleRejectQuestion = useCallback(
		async (messageId: string, blockId: string) => {
			if (!activeId) return;
			setLocalSessions((prev) =>
				upsertLocalSession(prev, activeId, (session) => ({
					...session,
					messages: session.messages.map((message) => {
						if (message.id !== messageId) return message;
						return {
							...message,
							questionBlocks: (message.questionBlocks || []).map((block) =>
								block.id === blockId ? { ...block, status: "rejecting", error: undefined } : block,
							),
						};
					}),
				})),
			);
			updatePersistedPendingQuestion(activeId, blockId, (entry) => ({
				...entry,
				block: { ...entry.block, status: "rejecting", error: undefined },
			}));

			try {
				await opencodeApi.rejectQuestion(blockId);
				removePersistedPendingQuestion(activeId, blockId);
				scheduleStreamingWatchdog(activeId);
				setLocalSessions((prev) =>
					upsertLocalSession(prev, activeId, (session) => ({
						...session,
						status: "streaming",
						error: undefined,
						messages: session.messages.map((message) => {
							if (message.id !== messageId) return message;
							return {
								...message,
								questionBlocks: (message.questionBlocks || []).map((block) =>
									block.id === blockId ? { ...block, status: "rejected", error: undefined } : block,
								),
							};
						}),
					})),
				);
			} catch (error) {
				const message = getErrorMessage(error, "Failed to reject question");
				setLocalSessions((prev) =>
					upsertLocalSession(prev, activeId, (session) => ({
						...session,
						messages: session.messages.map((item) => {
							if (item.id !== messageId) return item;
							return {
								...item,
								questionBlocks: (item.questionBlocks || []).map((block) =>
									block.id === blockId ? { ...block, status: "error", error: message } : block,
								),
							};
						}),
					})),
				);
				updatePersistedPendingQuestion(activeId, blockId, (entry) => ({
					...entry,
					block: { ...entry.block, status: "error", error: message },
				}));
			}
		},
		[activeId, scheduleStreamingWatchdog],
	);

	const handleRevertMessage = useCallback(
		async (messageId: string) => {
			if (!activeId) return;
			const session = localSessions.find((s) => s.id === activeId);
			const message = session?.messages.find((m) => m.id === messageId);
			try {
				await opencodeApi.revertMessage(activeId, messageId);
				const rawMessages = await opencodeApi.getMessages(activeId);
				const messages = mergePersistedPendingQuestions(
					rawMessages.map(normalizeOpenCodeMessage),
					readPersistedPendingQuestions(activeId),
				);
				setLocalSessions((prev) =>
					upsertLocalSession(prev, activeId, (s) => ({ ...s, messages, status: "idle" })),
				);
				if (message?.content) {
					setInputRestoreValue(message.content);
				}
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to revert message"));
			}
		},
		[activeId, localSessions],
	);

	const handleForkMessage = useCallback(
		async (messageId: string) => {
			if (!activeId || chatDisabled) {
				if (chatDisabled) toast.error(opencodeBlockedReason || "OpenCode is unavailable");
				return;
			}

			const session = localSessions.find((item) => item.id === activeId);
			if (!session) return;
			const sourceMessage = session.messages.find((message) => message.id === messageId);
			try {
				const sessionModel = session.model
					? { model: { providerID: session.model.providerID, modelID: session.model.modelID }, title: `${session.title || "New Chat"} fork` }
					: { title: `${session.title || "New Chat"} fork` };
				const created = await opencodeApi.createSession(sessionModel);
				const nextSession = {
					...toChatSessionFromOpenCodeSession(created),
					model: session.model,
					modelSource: session.model ? "session" as const : session.modelSource,
					parentSessionId: activeId,
					parentMessageId: messageId,
					title: created.title || `${session.title || "New Chat"} fork`,
				};
				setLocalSessions((prev) => mergeSessionList(prev, [nextSession]));
				setSessionParentMap((prev) => ({ ...prev, [nextSession.id]: activeId }));
				setActiveId(nextSession.id);
				updateSessionHash(nextSession.id);
				if (sourceMessage?.content) {
					setInputRestoreValue(sourceMessage.content);
				}
				toast.success("Created branch from selected message");
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to fork session"));
				await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to fork OpenCode session") });
			}
		},
		[activeId, chatDisabled, localSessions, opencodeBlockedReason, refreshOpenCodeStatus],
	);

	const handleStop = async () => {
		if (!activeId || chatDisabled) {
			if (chatDisabled) toast.error(opencodeBlockedReason || "OpenCode is unavailable");
			return;
		}
		try {
			clearIdleTransition(activeId);
			clearStreamingWatchdog(activeId);
			setLocalSessions((prev) =>
				upsertLocalSession(prev, activeId, (session) => ({
					...session,
					status: "idle",
					error: undefined,
					updatedAt: new Date().toISOString(),
				})),
			);
			await opencodeApi.stopSession(activeId);
		} catch (error) {
			console.error("Failed to stop chat:", error);
			setLocalSessions((prev) =>
				upsertLocalSession(prev, activeId, (session) => ({
					...session,
					status: "streaming",
					updatedAt: new Date().toISOString(),
				})),
			);
			toast.error(getErrorMessage(error, "Failed to stop OpenCode session"));
			await refreshOpenCodeStatus({ fallback: getErrorMessage(error, "Failed to stop OpenCode session") });
		}
	};

	const createNewChat = () => {
		if (chatDisabled) {
			toast.error(opencodeBlockedReason || "OpenCode is unavailable");
			return;
		}
		void handleNewChat();
	};

	// ─── Return ────────────────────────────────────────────────────────────────

	return {
		// loading
		loading,
		messagesLoading,
		// mobile
		mobileSidebarOpen,
		setMobileSidebarOpen,
		// sessions
		localSessions,
		activeId,
		activeSession,
		activeSessionTodos,
		activeQuestion,
		activePermission,
		activeQuickCommands,
		rootSessions,
		sessionActivity,
		queueCount,
		// status
		chatDisabled,
		opencodeBlockedReason,
		opencodeStatus,
		// model
		pickerProviders,
		catalog,
		modelSettings,
		autoModelLabel,
		lastLoadedAt,
		// slash items
		slashItems,
		// provider
		providerResponse,
		// preview dialogs
		previewTaskId,
		setPreviewTaskId,
		previewDocPath,
		setPreviewDocPath,
		// model manager
		setDefaultModel,
		setDefaultVariant,
		updateModelPref,
		toggleProviderHidden,
		// chat input
		inputRestoreValue,
		setInputRestoreValue,
		// handlers
		handleSelectSession,
		createNewChat,
		handleDelete,
		handleRename,
		handleModelChange,
		handleSend,
		handleSubmitQuestion,
		handleRejectQuestion,
		handleRespondPermission,
		handleRevertMessage,
		handleForkMessage,
		handleStop,
	};
}
