import type {
	ChatMessage,
	ChatQuestionBlock,
	ChatQuestionPrompt,
	ChatSession,
	ChatToolCall,
	SessionAgentItem,
} from "../../../models/chat";
import type { OpenCodeMessage, OpenCodeSession } from "../../../api/client";
import stripAnsi from "strip-ansi";
import { createModelRef } from "../../../lib/opencodeModels";

const SKILL_COMMAND_PATTERN =
	/(^|[\s([`])(?<command>\/kn-[a-z0-9][\w:-]*(?:\s+(?:<[^>\n]+>|\[[^\]\n]+\]|"[^"\n]+"|'[^'\n]+'|@[a-z0-9][\w./:-]*|[a-z0-9][\w./:-]*))*)/gi;

export function getTimeGroup(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);

	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days <= 7) return "Last 7 Days";
	return "Older";
}

export function getSessionSortDate(session: ChatSession): Date {
	for (let index = session.messages.length - 1; index >= 0; index -= 1) {
		const message = session.messages[index];
		if (message?.role === "user" && message.createdAt) {
			return new Date(message.createdAt);
		}
	}
	return new Date(session.createdAt);
}

export function getSessionSortTimestamp(session: ChatSession): number {
	return getSessionSortDate(session).getTime();
}

export function groupSessions(sessions: ChatSession[]): Map<string, ChatSession[]> {
	const groups = new Map<string, ChatSession[]>();
	const order = ["Today", "Yesterday", "Last 7 Days", "Older"];
	for (const label of order) groups.set(label, []);

	sessions.forEach((session) => {
		const group = getTimeGroup(getSessionSortDate(session).toISOString());
		groups.get(group)?.push(session);
	});

	for (const [key, value] of groups) {
		if (value.length === 0) groups.delete(key);
	}

	return groups;
}

export function getLastAssistantMessageIndex(messages: ChatMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role === "assistant") return index;
	}
	return -1;
}

export function isLastAssistantMessageInGroup(messages: ChatMessage[], index: number): boolean {
	const current = messages[index];
	if (!current || current.role !== "assistant") return true;

	for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
		const next = messages[nextIndex];
		if (!next) continue;
		if (next.role !== "assistant") return true;

		const sameParent = current.parentMessageId && next.parentMessageId
			? current.parentMessageId === next.parentMessageId
			: true;
		if (sameParent) return false;
		return true;
	}

	return true;
}

export function extractSkillCommands(markdown: string | undefined): string[] {
	if (!markdown) return [];

	const commands: string[] = [];
	const seen = new Set<string>();

	for (const match of markdown.matchAll(SKILL_COMMAND_PATTERN)) {
		const command = match.groups?.command?.trim().replace(/\s+/g, " ");
		if (!command) continue;
		const normalized = command.toLowerCase();
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		commands.push(command);
	}

	return commands;
}

export function stringifyToolOutput(output: unknown): string | undefined {
	if (output == null) return undefined;
	if (typeof output === "string") return stripAnsi(output);
	try {
		return stripAnsi(JSON.stringify(output, null, 2));
	} catch {
		return stripAnsi(String(output));
	}
}

export function getToolCallOutput(state: unknown): string | undefined {
	if (!state || typeof state !== "object") return undefined;
	const record = state as Record<string, unknown>;
	const metadata = record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : undefined;
	return stringifyToolOutput(record.output ?? metadata?.output);
}

export function getToolCallStatus(state: unknown): "loading" | "success" | "error" {
	if (!state || typeof state !== "object") return "loading";
	const rawStatus = (state as Record<string, unknown>).status;
	if (rawStatus === "completed" || rawStatus === "success" || rawStatus === "done") return "success";
	if (rawStatus === "error" || rawStatus === "failed") return "error";
	return "loading";
}

function stringifyInline(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || undefined;
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function normalizeAgentStatus(status: ChatToolCall["status"] | ChatSession["status"]): SessionAgentItem["status"] {
	if (status === "error") return "error";
	if (status === "loading" || status === "streaming") return "running";
	return "done";
}

function getTaskAgentKey(tool: ChatToolCall): string {
	return tool.name.trim().toLowerCase();
}

export function isQuestionToolName(name: string): boolean {
	const lower = name.trim().toLowerCase();
	return lower === "question" || lower === "askuserquestion";
}

export function isTaskAgentToolCall(tool: ChatToolCall): boolean {
	const name = getTaskAgentKey(tool);
	if (name === "task" || name.endsWith(".task") || name.startsWith("task:")) return true;
	return typeof tool.input.subagent_type === "string";
}

function getTaskAgentTitle(tool: ChatToolCall): string {
	return (
		stringifyInline(tool.input.description) ||
		stringifyInline(tool.input.command) ||
		stringifyInline(tool.input.prompt) ||
		stringifyInline(tool.input.subagent_type) ||
		"Task agent"
	);
}

function getTaskAgentSubtitle(tool: ChatToolCall): string | undefined {
	const parts = [
		stringifyInline(tool.input.subagent_type),
		stringifyInline(tool.input.description),
	]
		.filter(Boolean)
		.filter((value, index, all) => all.indexOf(value) === index);

	return parts.length > 0 ? parts.join(" · ") : undefined;
}

function getTaskAgentSummary(tool: ChatToolCall): string | undefined {
	const output = tool.output?.trim();
	if (!output) return undefined;
	return output.split("\n").find((line) => line.trim())?.trim();
}

function extractTaskSessionId(output?: string): string | undefined {
	if (!output) return undefined;
	const match = output.match(/task_id:\s*([A-Za-z0-9_-]+)/i);
	return match?.[1];
}

export function toTaskAgentItem(toolCall: ChatToolCall, message: Pick<ChatMessage, "id" | "createdAt">): Extract<SessionAgentItem, { kind: "task" }> {
	const inputTaskId = stringifyInline(toolCall.input.taskId) || stringifyInline(toolCall.input.task_id);
	const outputTaskId = extractTaskSessionId(toolCall.output);
	return {
		id: `task:${toolCall.id}`,
		kind: "task",
		title: getTaskAgentTitle(toolCall),
		subtitle: getTaskAgentSubtitle(toolCall),
		status: normalizeAgentStatus(toolCall.status),
		createdAt: message.createdAt,
		updatedAt: message.createdAt,
		agentLabel: stringifyInline(toolCall.input.subagent_type),
		command: stringifyInline(toolCall.input.command),
		prompt: stringifyInline(toolCall.input.prompt),
		description: stringifyInline(toolCall.input.description),
		summary: getTaskAgentSummary(toolCall),
		toolCall,
		messageId: message.id,
		taskId: inputTaskId || outputTaskId,
	};
}

function getCommandBase(command?: string): string | undefined {
	if (!command) return undefined;
	const match = command.trim().match(/^\/kn-[a-z0-9-]+/i);
	return match?.[0]?.toLowerCase();
}

function buildTaskAgentFingerprint(tool: ChatToolCall): string {
	const command = stringifyInline(tool.input.command)?.toLowerCase();
	const prompt = stringifyInline(tool.input.prompt)?.toLowerCase();
	const taskId = stringifyInline(tool.input.taskId) || stringifyInline(tool.input.task_id);
	const description = stringifyInline(tool.input.description)?.toLowerCase();
	const subagentType = stringifyInline(tool.input.subagent_type)?.toLowerCase();
	return [command || prompt || description || tool.name.toLowerCase(), taskId || "", subagentType || ""].join("|");
}

function isWorkflowSubSessionTitle(title: string): boolean {
	return /^run kn-[a-z0-9-]+/i.test(title.trim());
}

function getSessionCommandBase(session: ChatSession): string | undefined {
	const fromTitle = session.title.trim().match(/kn-[a-z0-9-]+/i)?.[0];
	return fromTitle ? `/${fromTitle.toLowerCase()}` : undefined;
}

export function getSessionAgents(session: ChatSession, subSessions: ChatSession[]): SessionAgentItem[] {
	const taskAgentMap = new Map<string, Extract<SessionAgentItem, { kind: "task" }>>();
	for (const message of session.messages) {
		for (const toolCall of message.toolCalls || []) {
			if (!isTaskAgentToolCall(toolCall)) continue;
			const fingerprint = buildTaskAgentFingerprint(toolCall);
			const existing = taskAgentMap.get(fingerprint);
			const candidate = toTaskAgentItem(toolCall, message);
			if (!existing) {
				taskAgentMap.set(fingerprint, candidate);
				continue;
			}

			const existingTime = new Date(existing.updatedAt).getTime();
			const candidateTime = new Date(candidate.updatedAt).getTime();
			const preferred = candidateTime >= existingTime ? candidate : existing;
			taskAgentMap.set(fingerprint, {
				...preferred,
				status:
					existing.status === "running" || candidate.status === "running"
						? "running"
						: existing.status === "error" || candidate.status === "error"
							? "error"
							: preferred.status,
				summary: preferred.summary || existing.summary || candidate.summary,
				description: preferred.description || existing.description || candidate.description,
			});
		}
	}

	const taskAgents = Array.from(taskAgentMap.values());
	const workflowCommandBases = new Set(taskAgents.map((agent) => getCommandBase(agent.command)).filter(Boolean));
	const sessionAgents: SessionAgentItem[] = subSessions
		.filter((subSession) => {
			if (!isWorkflowSubSessionTitle(subSession.title)) return true;
			const sessionCommandBase = getSessionCommandBase(subSession);
			return !sessionCommandBase || !workflowCommandBases.has(sessionCommandBase);
		})
		.map((subSession) => {
			const latestAssistant = [...subSession.messages].reverse().find((message) => message.role === "assistant");
			return {
				id: `session:${subSession.id}`,
				kind: "session",
				title: subSession.title || "Sub-agent",
				subtitle: [subSession.agent, subSession.mode].filter(Boolean).join(" · ") || undefined,
				status: normalizeAgentStatus(subSession.status),
				createdAt: subSession.createdAt,
				updatedAt: subSession.updatedAt,
				agentLabel: subSession.agent || undefined,
				command: undefined,
				prompt: undefined,
				description: undefined,
				summary: latestAssistant?.content?.replace(/\s+/g, " ").trim() || undefined,
				session: subSession,
			};
		});

	return [...sessionAgents, ...taskAgents].sort((left, right) => {
		const leftRank = left.status === "running" ? 0 : left.status === "error" ? 1 : 2;
		const rightRank = right.status === "running" ? 0 : right.status === "error" ? 1 : 2;
		if (leftRank !== rightRank) return leftRank - rightRank;
		return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
	});
}

export function mergeStreamText(
	existing: string | undefined,
	incoming: string | undefined,
	bufferedDelta = "",
): string {
	const current = existing || "";
	const next = incoming || "";
	const base = next.length >= current.length ? next : current;
	if (!bufferedDelta) return base;
	if (base.endsWith(bufferedDelta)) return base;
	return `${base}${bufferedDelta}`;
}

export function normalizeOpenCodeMessage(rawMessage: OpenCodeMessage): ChatMessage {
	const info = rawMessage.info || {};
	let content = "";
	let reasoning = "";
	const toolCalls: NonNullable<ChatMessage["toolCalls"]> = [];
	const questionBlocks: NonNullable<ChatMessage["questionBlocks"]> = [];
	const attachments: NonNullable<ChatMessage["attachments"]> = [];

	for (const part of rawMessage.parts || []) {
		const questionBlock = normalizeQuestionBlock(part);
		if (questionBlock) {
			questionBlocks.push(questionBlock);
			continue;
		}

		if (part?.type === "text" && typeof part.text === "string") {
			content += part.text;
			continue;
		}

		if (part?.type === "file" && typeof part.url === "string" && typeof part.mime === "string") {
			const filename = typeof part.filename === "string" && part.filename.trim() ? part.filename.trim() : "attachment";
			attachments.push({
				id: part.id || `${info.id || "message"}_file_${attachments.length}`,
				mime: part.mime,
				url: part.url,
				filename,
			});
			continue;
		}

		if (part?.type === "reasoning") {
			const text =
				typeof part.text === "string"
					? part.text
					: typeof part.reasoning === "string"
						? part.reasoning
						: "";
			reasoning += text;
			continue;
		}

		if (part?.type === "tool") {
			const state = part.state || {};
			const toolName = part.tool || part.name || "tool";
			const status = getToolCallStatus(state);
			if (isQuestionToolName(toolName) && status !== "success") {
				// Skip pending question tool parts — the real questionBlock comes from
				// a separate `type: "question"` event with a proper `que_...` ID
				continue;
			}
			toolCalls.push({
				id: part.callID || part.id || `tool_${toolCalls.length}`,
				name: toolName,
				input: typeof state.input === "object" && state.input ? state.input : {},
				output: getToolCallOutput(state),
				status,
				title: typeof state.title === "string" ? state.title : undefined,
				metadata: state.metadata && typeof state.metadata === "object" ? (state.metadata as Record<string, unknown>) : undefined,
			});
		}
	}

	return {
		id: info.id || `message_${Date.now()}`,
		role: info.role === "assistant" ? "assistant" : "user",
		content,
		model: info.modelID || "",
		parentMessageId: info.parentID || undefined,
		createdAt: info.time?.created ? new Date(info.time.created).toISOString() : new Date().toISOString(),
		cost: typeof info.cost === "number" ? info.cost : undefined,
		providerID: info.providerID || undefined,
		tokens: typeof info.tokens?.total === "number" ? info.tokens.total : undefined,
		inputTokens: typeof info.tokens?.input === "number" ? info.tokens.input : undefined,
		outputTokens: typeof info.tokens?.output === "number" ? info.tokens.output : undefined,
		reasoning: reasoning || undefined,
		toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		questionBlocks: questionBlocks.length > 0 ? questionBlocks : undefined,
		attachments: attachments.length > 0 ? attachments : undefined,
	};
}

function normalizeQuestionPrompt(part: Record<string, unknown>): ChatQuestionPrompt | null {
	const rawQuestion = typeof part.question === "string" ? part.question.trim() : "";
	const rawOptions = Array.isArray(part.options) ? part.options : [];
	if (!rawQuestion || rawOptions.length === 0) return null;

	const options: ChatQuestionPrompt["options"] = [];
	for (const option of rawOptions) {
		if (!option || typeof option !== "object") continue;
		const record = option as Record<string, unknown>;
		const label = typeof record.label === "string" ? record.label.trim() : "";
		if (!label) continue;
		options.push({
			label,
			description: typeof record.description === "string" ? record.description.trim() || undefined : undefined,
		});
	}

	if (options.length === 0) return null;

	return {
		header: typeof part.header === "string" ? part.header.trim() || undefined : undefined,
		question: rawQuestion,
		multiple: part.multiple === true,
		options,
	};
}

export function normalizeQuestionBlock(part: unknown): ChatQuestionBlock | null {
	if (!part || typeof part !== "object") return null;
	const record = part as Record<string, unknown>;
	if (record.type !== "question") return null;

	const rawQuestions = Array.isArray(record.questions)
		? record.questions
		: Array.isArray((record.state as Record<string, unknown> | undefined)?.questions)
			? ((record.state as Record<string, unknown>).questions as unknown[])
			: [];

	const prompts = rawQuestions
		.map((question) => normalizeQuestionPrompt(question as Record<string, unknown>))
		.filter((question): question is ChatQuestionPrompt => Boolean(question));

	if (prompts.length === 0) {
		const singlePrompt = normalizeQuestionPrompt(record);
		if (!singlePrompt) return null;
		prompts.push(singlePrompt);
	}

	const selectedAnswers = Array.isArray(record.answers)
		? record.answers.filter((answer): answer is string[] => Array.isArray(answer) && answer.every((item) => typeof item === "string"))
		: undefined;

	const rawStatus = typeof record.status === "string" ? record.status : undefined;
	return {
		id:
			(typeof record.id === "string" && record.id) ||
			(typeof record.questionID === "string" && record.questionID) ||
			`question_${Date.now()}`,
		prompts,
		selectedAnswers: selectedAnswers && selectedAnswers.length > 0 ? selectedAnswers : undefined,
		status:
			rawStatus === "submitting" ||
			rawStatus === "submitted" ||
			rawStatus === "rejecting" ||
			rawStatus === "rejected" ||
			rawStatus === "error" ||
			rawStatus === "idle"
				? rawStatus
				: undefined,
		error: typeof record.error === "string" ? record.error : undefined,
	};
}

export function normalizeQuestionEventBlock(
	questionId: string,
	questions: unknown,
	answers?: unknown,
): ChatQuestionBlock | null {
	const rawQuestions = Array.isArray(questions) ? questions : [];
	const prompts = rawQuestions
		.map((question) => normalizeQuestionPrompt(question as Record<string, unknown>))
		.filter((question): question is ChatQuestionPrompt => Boolean(question));

	if (prompts.length === 0) return null;

	const selectedAnswers = Array.isArray(answers)
		? answers.filter((answer): answer is string[] => Array.isArray(answer) && answer.every((item) => typeof item === "string"))
		: undefined;

	return {
		id: questionId,
		prompts,
		selectedAnswers: selectedAnswers && selectedAnswers.length > 0 ? selectedAnswers : undefined,
		status: selectedAnswers && selectedAnswers.length > 0 ? "submitted" : "idle",
	};
}

export function mergeQuestionBlocks(
	existing: ChatQuestionBlock[] | undefined,
	incoming: ChatQuestionBlock,
): ChatQuestionBlock[] {
	const blocks = [...(existing || [])];
	const index = blocks.findIndex((block) => block.id === incoming.id);
	if (index >= 0) {
		const existingBlock = blocks[index];
		if (!existingBlock) return blocks;
		blocks[index] = {
			...existingBlock,
			...incoming,
			prompts: incoming.prompts.length > 0 ? incoming.prompts : existingBlock.prompts,
			selectedAnswers: incoming.selectedAnswers || existingBlock.selectedAnswers,
		};
		return blocks;
	}
	blocks.push(incoming);
	return blocks;
}

export function deriveParentMessageIdFromRawMessages(messages: OpenCodeMessage[]): string | undefined {
	for (const message of messages) {
		const parentId = message.info?.parentID;
		if (typeof parentId === "string" && parentId) {
			return parentId;
		}
	}
	return undefined;
}

export function getEventSessionId(data: any): string | undefined {
	return (
		data?.payload?.properties?.sessionID ||
		data?.payload?.properties?.info?.sessionID ||
		data?.payload?.properties?.part?.sessionID ||
		data?.payload?.info?.sessionID ||
		data?.properties?.sessionID ||
		data?.properties?.info?.sessionID ||
		data?.properties?.part?.sessionID ||
		data?.info?.sessionID
	);
}

export function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

export function getSessionErrorText(error: unknown, fallback = "Session failed"): string {
	if (!error || typeof error !== "object") return fallback;
	const record = error as Record<string, unknown>;
	const nestedData =
		record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null;
	const candidates = [nestedData?.message, record.message, record.name];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim();
		}
	}

	return fallback;
}

export function toChatSessionFromOpenCodeSession(
	session: Partial<OpenCodeSession> & {
		id: string;
		title?: string;
		parentID?: string | null;
		providerID?: string;
		modelID?: string;
		permission?: Array<{ permission: string; pattern: string; action: string }>;
		time?: { created?: number; updated?: number };
	},
): ChatSession {
	const model = session.providerID && session.modelID ? createModelRef(session.providerID, session.modelID) : null;
	return {
		id: session.id,
		sessionId: session.id,
		title: session.title || "New Chat",
		directory: session.directory,
		agentType: "opencode",
		model,
		modelSource: model ? "session" : "auto",
		parentSessionId: session.parentID || undefined,
		permissions: Array.isArray(session.permission) ? session.permission : undefined,
		status: "idle",
		createdAt: new Date(session.time?.created || Date.now()).toISOString(),
		updatedAt: new Date(session.time?.updated || Date.now()).toISOString(),
		messages: [],
	};
}

export function mergeChatSessions(existing: ChatSession, incoming: ChatSession): ChatSession {
	const nextStatus =
		incoming.status === "streaming" || incoming.status === "error"
			? incoming.status
			: existing.status === "streaming" || existing.status === "error"
				? existing.status
				: incoming.status;

	return {
		...existing,
		...incoming,
		status: nextStatus,
		updatedAt:
			new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()
				? incoming.updatedAt
				: existing.updatedAt,
		messages: incoming.messages.length > 0 ? incoming.messages : existing.messages,
		model: incoming.model ?? existing.model,
		modelSource: incoming.modelSource ?? existing.modelSource,
		providerID: incoming.providerID || existing.providerID,
		mode: incoming.mode || existing.mode,
		agent: incoming.agent || existing.agent,
		error: incoming.error ?? existing.error,
		parentMessageId: incoming.parentMessageId || existing.parentMessageId,
		permissions: incoming.permissions || existing.permissions,
	};
}

export function mergeSessionList(existing: ChatSession[], incoming: ChatSession[]): ChatSession[] {
	const next = [...existing];

	incoming.forEach((session) => {
		const index = next.findIndex((item) => item.id === session.id);
	if (index >= 0) {
		const existingSession = next[index];
		if (!existingSession) return;
		next[index] = mergeChatSessions(existingSession, session);
	} else {
			next.push(session);
		}
	});

	return next.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export function createPlaceholderSession(sessionId: string): ChatSession {
	return {
		id: sessionId,
		sessionId,
		title: "New Chat",
		agentType: "opencode",
		model: null,
		modelSource: "auto",
		status: "idle",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		messages: [],
	};
}

export function upsertLocalSession(
	sessions: ChatSession[],
	sessionId: string,
	updater: (session: ChatSession) => ChatSession,
): ChatSession[] {
	const index = sessions.findIndex((session) => session.id === sessionId);
	if (index >= 0) {
		const next = [...sessions];
		const existingSession = next[index];
		if (!existingSession) return sessions;
		next[index] = updater(existingSession);
		return next;
	}

	return [updater(createPlaceholderSession(sessionId)), ...sessions];
}

export function isTrackedSession(session: ChatSession, activeId: string | null): boolean {
	return session.id === activeId || session.parentSessionId === activeId;
}

export function ensureMessage(
	messages: ChatMessage[],
	options: {
		messageId: string;
		role: "user" | "assistant";
		createdAt?: string;
		model?: string;
		parentMessageId?: string;
	},
): { messages: ChatMessage[]; index: number } {
	const { messageId, role, createdAt, model, parentMessageId } = options;
	const existingIndex = messages.findIndex((message) => message.id === messageId);
	if (existingIndex >= 0) {
		const nextMessages = [...messages];
		const existingMessage = nextMessages[existingIndex];
		if (!existingMessage) return { messages, index: existingIndex };
		nextMessages[existingIndex] = {
			...existingMessage,
			role,
			model: model ?? existingMessage.model,
			createdAt: createdAt ?? existingMessage.createdAt,
			parentMessageId: parentMessageId ?? existingMessage.parentMessageId,
		};
		return { messages: nextMessages, index: existingIndex };
	}

	if (role === "user") {
		const optimisticIndex = [...messages].findLastIndex(
			(message) => message.role === "user" && message.id.startsWith("temp_"),
		);
		if (optimisticIndex >= 0) {
			const nextMessages = [...messages];
			const optimisticMessage = nextMessages[optimisticIndex];
			if (!optimisticMessage) return { messages, index: optimisticIndex };
			nextMessages[optimisticIndex] = {
				...optimisticMessage,
				id: messageId,
				role,
				model: model ?? optimisticMessage.model,
				createdAt: createdAt ?? optimisticMessage.createdAt,
				parentMessageId: parentMessageId ?? optimisticMessage.parentMessageId,
			};
			return { messages: nextMessages, index: optimisticIndex };
		}
	}

	const nextMessage: ChatMessage = {
		id: messageId,
		role,
		content: "",
		model: model ?? "",
		createdAt: createdAt ?? new Date().toISOString(),
		parentMessageId,
	};

	return { messages: [...messages, nextMessage], index: messages.length };
}

export function ensureAssistantMessage(
	messages: ChatMessage[],
	options: {
		messageId: string;
		createdAt?: string;
		model?: string;
		parentMessageId?: string;
	},
): { messages: ChatMessage[]; index: number } {
	return ensureMessage(messages, { ...options, role: "assistant" });
}

export interface ChatTodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
	priority?: string;
}

export function extractTodoItems(toolInput: Record<string, unknown> | undefined): ChatTodoItem[] {
	const rawTodos = toolInput?.todos || toolInput?.tasks;
	if (!Array.isArray(rawTodos)) return [];

	return rawTodos
		.map((todo, index) => {
			if (typeof todo === "string") {
				return { id: `todo_${index}`, content: todo, status: "pending" as const };
			}

			if (!todo || typeof todo !== "object") return null;
			const record = todo as Record<string, unknown>;
			const content =
				(typeof record.content === "string" && record.content) ||
				(typeof record.subject === "string" && record.subject) ||
				(typeof record.description === "string" && record.description) ||
				(typeof record.title === "string" && record.title) ||
				"";
			if (!content) return null;

			const rawStatus = typeof record.status === "string" ? record.status.toLowerCase() : "";
			const completed =
				record.completed === true ||
				record.done === true ||
				rawStatus === "completed" ||
				rawStatus === "done";
			const inProgress =
				rawStatus === "in_progress" ||
				rawStatus === "in-progress" ||
				rawStatus === "active" ||
				rawStatus === "doing";

			return {
				id: (typeof record.id === "string" && record.id) || `todo_${index}`,
				content,
				status: completed ? "completed" : inProgress ? "in_progress" : "pending",
				priority: typeof record.priority === "string" ? record.priority : undefined,
			};
		})
		.filter((item): item is ChatTodoItem => Boolean(item));
}

export function getLatestChatTodos(session: ChatSession | null): ChatTodoItem[] {
	if (!session) return [];
	const shouldAutoComplete = session.status === "idle";
	const withTodoTool = [...session.messages]
		.reverse()
		.find((message) =>
			(message.toolCalls || []).some((tool) => tool.name.toLowerCase().includes("todo")),
		);
	if (!withTodoTool?.toolCalls) return [];

	for (const tool of withTodoTool.toolCalls) {
		const todos = extractTodoItems(tool.input);
		if (todos.length > 0) {
			if (shouldAutoComplete) {
				return todos.map((todo) => ({
					...todo,
					status: "completed",
				}));
			}
			const hasIncomplete = todos.some((todo) => todo.status !== "completed");
			return hasIncomplete ? todos : [];
		}
	}

	return [];
}
