import { useEffect, useRef, useState } from "react";

import { opencodeApi } from "../api/client";
import { useOpenCodeEvent } from "../contexts/OpenCodeEventContext";
import type { ChatSession } from "../models/chat";
import {
	deriveParentMessageIdFromRawMessages,
	ensureAssistantMessage,
	ensureMessage,
	getToolCallOutput,
	getToolCallStatus,
	mergeStreamText,
	normalizeOpenCodeMessage,
	toChatSessionFromOpenCodeSession,
} from "../components/organisms/ChatPage/helpers";

/**
 * Connects to the OpenCode per-session event stream and returns a live ChatSession.
 * Does an initial API fetch for existing messages, then streams updates in real-time.
 *
 * Uses the shared OpenCodeEventContext (singleton global EventSource) instead of
 * opening a per-session SSE connection. This prevents HTTP/1.1 connection slot
 * exhaustion when multiple sub-agent sessions are rendered simultaneously.
 */
export function useSubAgentSession(sessionId: string | null | undefined): {
	session: ChatSession | null;
	loading: boolean;
} {
	const [session, setSession] = useState<ChatSession | null>(null);
	const [loading, setLoading] = useState(Boolean(sessionId));
	const partKindsRef = useRef<Record<string, string>>({});
	const pendingDeltasRef = useRef<Record<string, string>>({});
	const { subscribe } = useOpenCodeEvent();

	useEffect(() => {
		if (!sessionId) {
			setSession(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		partKindsRef.current = {};
		pendingDeltasRef.current = {};

		// 1. Initial fetch
		const init = async () => {
			try {
				const [sessionInfo, rawMessages] = await Promise.all([
					opencodeApi.getSession(sessionId),
					opencodeApi.getMessages(sessionId),
				]);
				if (cancelled) return;
				setSession({
					...toChatSessionFromOpenCodeSession(sessionInfo),
					title: sessionInfo.title || "Task agent",
					parentMessageId: deriveParentMessageIdFromRawMessages(rawMessages),
					messages: rawMessages.map(normalizeOpenCodeMessage),
				});
			} catch {
				if (!cancelled) setLoading(false);
				return;
			}
			if (!cancelled) setLoading(false);
		};
		void init();

		// 2. Subscribe to the shared global event stream (no new SSE connection opened).
		const unsubscribe = subscribe((data: unknown) => {
			if (cancelled) return;
			try {
				const event = data as Record<string, any>;
				const part = event.properties?.part;

				if ((event.type === "message.created" || event.type === "message.updated") && event.properties?.info?.sessionID === sessionId) {
					const info = event.properties.info;
					const createdAt = info.time?.created ? new Date(info.time.created).toISOString() : new Date().toISOString();
					setSession((prev) => {
						if (!prev) return prev;
						const ensured = ensureMessage(prev.messages, {
							messageId: info.id,
							role: info.role === "assistant" ? "assistant" : "user",
							createdAt,
							model: info.modelID || prev.model?.modelID || "",
							parentMessageId: info.parentID || undefined,
						});
						return {
							...prev,
							messages: ensured.messages,
							updatedAt: new Date(info.time?.created || Date.now()).toISOString(),
							status: prev.status === "error" ? prev.status : "streaming",
						};
					});
				}

				if (event.type === "message.part.updated" && part?.sessionID === sessionId) {
					partKindsRef.current[part.id] = part.type;
					const buffered = pendingDeltasRef.current[part.id] || "";
					delete pendingDeltasRef.current[part.id];

					setSession((prev) => {
						if (!prev) return prev;

						if (part.type === "step-start") {
							const ensured = ensureAssistantMessage(prev.messages, {
								messageId: part.messageID,
								createdAt: new Date().toISOString(),
							});
							return { ...prev, messages: ensured.messages, status: "streaming" };
						}

						if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
							const idx = prev.messages.findIndex((m) => m.id === part.messageID);
							if (idx < 0) return prev;
							const messages = [...prev.messages];
							const msg = messages[idx]!;
							messages[idx] = {
								...msg,
								content: part.type === "text" ? mergeStreamText(msg.content, part.text, buffered) : msg.content,
								reasoning: part.type === "reasoning" ? mergeStreamText(msg.reasoning, part.text, buffered) : msg.reasoning,
							};
							return { ...prev, messages, status: "streaming" };
						}

						if (part.type === "tool") {
							const ensured = ensureAssistantMessage(prev.messages, { messageId: part.messageID });
							const messages = [...ensured.messages];
							const msg = messages[ensured.index];
							if (!msg) return prev;
							const existing = msg.toolCalls || [];
							const callID = part.callID;
							const idx = callID ? existing.findIndex((t) => t.id === callID) : -1;
							const toolCall = {
								id: callID || `tool_${existing.length}`,
								name: part.tool || "tool",
								input: typeof part.state?.input === "object" && part.state?.input ? part.state.input : {},
								output: getToolCallOutput(part.state),
								status: getToolCallStatus(part.state),
								title: typeof part.state?.title === "string" ? part.state.title : undefined,
								metadata: part.state?.metadata && typeof part.state.metadata === "object"
									? (part.state.metadata as Record<string, unknown>)
									: undefined,
							};
							const toolCalls = [...existing];
							if (idx >= 0) {
								toolCalls[idx] = { ...toolCalls[idx]!, ...toolCall, input: toolCall.input || toolCalls[idx]!.input };
							} else {
								toolCalls.push(toolCall);
							}
							messages[ensured.index] = { ...msg, toolCalls };
							return { ...prev, messages, status: "streaming" };
						}

						return prev;
					});
				}

				if (event.type === "message.part.delta" && event.properties?.sessionID === sessionId) {
					const { messageID, partID, delta } = event.properties;
					const partKind = partKindsRef.current[partID];
					if (typeof delta !== "string" || !messageID) return;

					if (!partKind) {
						pendingDeltasRef.current[partID] = `${pendingDeltasRef.current[partID] || ""}${delta}`;
						return;
					}

					setSession((prev) => {
						if (!prev) return prev;
						const ensured = ensureAssistantMessage(prev.messages, { messageId: messageID });
						const messages = [...ensured.messages];
						const msg = messages[ensured.index];
						if (!msg) return prev;
						messages[ensured.index] = {
							...msg,
							content: partKind === "text" ? `${msg.content || ""}${delta}` : msg.content,
							reasoning: partKind === "reasoning" ? `${msg.reasoning || ""}${delta}` : msg.reasoning,
						};
						return { ...prev, messages, status: "streaming" };
					});
				}

				if (event.type === "session.updated" && event.properties?.info?.id === sessionId) {
					const info = event.properties.info;
					setSession((prev) =>
						prev
							? {
								...prev,
								title: info.title || prev.title,
								updatedAt: new Date(info.time?.updated || Date.now()).toISOString(),
								parentSessionId: info.parentID || prev.parentSessionId,
							}
							: prev,
					);
				}

				if (
					(event.type === "session.idle" || (event.type === "session.status" && event.properties?.status?.type === "idle")) &&
					(event.properties?.sessionID === sessionId || event.properties?.id === sessionId)
				) {
					setSession((prev) => prev ? { ...prev, status: "idle" } : prev);
				}

				if (event.type === "session.error" && (event.properties?.sessionID === sessionId || event.properties?.id === sessionId)) {
					setSession((prev) => prev ? { ...prev, status: "error" } : prev);
				}
			} catch {
				// ignore parse errors
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [sessionId, subscribe]);

	return { session, loading };
}
