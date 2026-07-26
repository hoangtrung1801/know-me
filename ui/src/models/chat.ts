/**
 * Chat Domain Model
 * Core entities for AI chat sessions
 */

export interface ChatToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	output?: string;
	status: "loading" | "success" | "error";
	title?: string;
	metadata?: Record<string, unknown>;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	model: string;
	createdAt: string;
	error?: string;
	parentMessageId?: string;
	cost?: number;
	duration?: number; // milliseconds
	tokens?: number; // total tokens used
	inputTokens?: number;
	outputTokens?: number;
	// OpenCode extended fields
	reasoning?: string;
	providerID?: string;
	toolCalls?: ChatToolCall[];
	questionBlocks?: ChatQuestionBlock[];
	attachments?: ChatMessageAttachment[];
}

export interface ChatQuestionOption {
	label: string;
	description?: string;
}

export interface ChatQuestionPrompt {
	header?: string;
	question: string;
	multiple?: boolean;
	options: ChatQuestionOption[];
}

export interface ChatQuestionBlock {
	id: string;
	prompts: ChatQuestionPrompt[];
	selectedAnswers?: string[][];
	status?: "idle" | "submitting" | "submitted" | "rejecting" | "rejected" | "error";
	error?: string;
}

export interface ChatComposerFile {
	id: string;
	mime: string;
	url: string;
	filename: string;
}

export interface ChatMessageAttachment {
	id: string;
	mime: string;
	url: string;
	filename: string;
}

export interface ModelRef {
	key: string;
	providerID: string;
	modelID: string;
	variant?: string | null;
}

export interface OpenCodeModelSettings {
	version: number;
	defaultModel?: ModelRef | null;
	variantModels?: Record<string, string>;
	activeModels?: string[];
	hiddenProviders?: string[];
}

export interface OpenCodeCatalogModel {
	key: string;
	providerID: string;
	providerName: string;
	modelID: string;
	modelName: string;
	connected: boolean;
	apiDefault: boolean;
	enabled: boolean;
	pinned: boolean;
	hiddenByProvider: boolean;
	selectable: boolean;
	supportsImageInput?: boolean;
	stale?: boolean;
	variants?: Record<string, Record<string, unknown>>;
}

export interface OpenCodeCatalogProvider {
	id: string;
	name: string;
	connected: boolean;
	hidden: boolean;
	models: OpenCodeCatalogModel[];
}

export interface OpenCodeCatalogState {
	status: "idle" | "loading" | "ready" | "error";
	providers: OpenCodeCatalogProvider[];
	models: OpenCodeCatalogModel[];
	staleModels: OpenCodeCatalogModel[];
	apiDefault?: ModelRef | null;
	projectDefault?: ModelRef | null;
	effectiveDefault?: ModelRef | null;
	error?: string;
	lastLoadedAt?: string;
}

export interface ChatSession {
	id: string;
	sessionId: string;
	title: string;
	directory?: string;
	agentType: "claude" | "opencode";
	model?: ModelRef | null;
	variant?: string | null;
	modelSource?: "session" | "project-default" | "opencode-default" | "auto";
	providerID?: string;
	mode?: string;
	agent?: string;
	status: "idle" | "streaming" | "error";
	error?: string;
	taskId?: string;
	parentSessionId?: string;
	parentMessageId?: string;
	permissions?: Array<{
		permission: string;
		pattern: string;
		action: string;
	}>;
	createdAt: string;
	updatedAt: string;
	messages: ChatMessage[];
}

export interface SessionAgentBase {
	id: string;
	title: string;
	subtitle?: string;
	status: "running" | "done" | "error";
	createdAt: string;
	updatedAt: string;
	agentLabel?: string;
	command?: string;
	prompt?: string;
	description?: string;
	summary?: string;
}

export interface SessionAgentSessionItem extends SessionAgentBase {
	kind: "session";
	session: ChatSession;
}

export interface SessionAgentTaskItem extends SessionAgentBase {
	kind: "task";
	toolCall: ChatToolCall;
	messageId: string;
	taskId?: string;
}

export type SessionAgentItem = SessionAgentSessionItem | SessionAgentTaskItem;

export interface AgentInfo {
	name: string;
	displayName: string;
	available: boolean;
}

export interface AgentModelDef {
	id: string;
	displayName: string;
	agentType: string;
	providerID?: string;
	providerName?: string;
	modelID?: string;
	modelName?: string;
	available?: boolean;
}

/**
 * Normalized event from agent-proxy Go binary (JSONL on stdout)
 */
export interface ProxyEvent {
	type: "init" | "thinking" | "text" | "tool_use" | "tool_result" | "result" | "error" | "stderr" | "exit";
	text?: string;
	agent: string;
	ts: number;
	raw?: unknown;
}
