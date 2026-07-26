import type { ChatQuestionBlock } from "../../models/chat";
import { mergeQuestionBlocks, normalizeOpenCodeMessage } from "../../components/organisms/ChatPage/helpers";

// ─── Session route helpers ───────────────────────────────────────────────────

export function getSessionIdFromHash(): string | null {
	if (typeof window === "undefined") return null;
	const pathMatch = window.location.pathname.match(/^\/chat\/([^/]+)$/);
	if (pathMatch?.[1]) {
		return decodeURIComponent(pathMatch[1]);
	}
	return window.location.hash.replace(/^#/, "") || null;
}

export function updateSessionHash(sessionId: string | null) {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	const basePath = "/chat";
	if (sessionId) {
		url.pathname = `${basePath}/${encodeURIComponent(sessionId)}`;
		url.hash = "";
	} else {
		url.pathname = basePath;
		url.hash = "";
	}
	window.history.replaceState(null, "", url.toString());
}

// ─── Session model persistence ────────────────────────────────────────────────

export function getSessionModelsFromStorage(): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const stored = localStorage.getItem("knowns_session_models");
		return stored ? JSON.parse(stored) : {};
	} catch {
		return {};
	}
}

export function saveSessionModelToStorage(sessionId: string, modelKey: string | null) {
	if (typeof window === "undefined") return;
	try {
		const models = getSessionModelsFromStorage();
		if (modelKey) {
			models[sessionId] = modelKey;
		} else {
			delete models[sessionId];
		}
		localStorage.setItem("knowns_session_models", JSON.stringify(models));
	} catch (e) {
		console.error("Failed to save session model", e);
	}
}

// ─── Pending question persistence ─────────────────────────────────────────────

const PENDING_QUESTION_STORAGE_PREFIX = "knowns.chat.pending-question:";

export type PersistedPendingQuestion = {
	messageId: string;
	block: ChatQuestionBlock;
};

export function isQuestionResolved(block: Pick<ChatQuestionBlock, "status"> | null | undefined): boolean {
	return block?.status === "submitted" || block?.status === "rejected";
}

function getPendingQuestionStorageKey(sessionId: string): string {
	return `${PENDING_QUESTION_STORAGE_PREFIX}${sessionId}`;
}

export function readPersistedPendingQuestions(sessionId: string): PersistedPendingQuestion[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(getPendingQuestionStorageKey(sessionId));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry): entry is PersistedPendingQuestion => {
			if (!entry || typeof entry !== "object") return false;
			const record = entry as Record<string, unknown>;
			if (typeof record.messageId !== "string") return false;
			if (!record.block || typeof record.block !== "object") return false;
			const block = record.block as ChatQuestionBlock;
			return typeof block.id === "string" && !isQuestionResolved(block);
		});
	} catch {
		return [];
	}
}

export function writePersistedPendingQuestions(sessionId: string, items: PersistedPendingQuestion[]) {
	if (typeof window === "undefined") return;
	const nextItems = items.filter((item) => !isQuestionResolved(item.block));
	const key = getPendingQuestionStorageKey(sessionId);
	if (nextItems.length === 0) {
		window.localStorage.removeItem(key);
		return;
	}
	window.localStorage.setItem(key, JSON.stringify(nextItems));
}

export function upsertPersistedPendingQuestion(sessionId: string, messageId: string, block: ChatQuestionBlock) {
	const existing = readPersistedPendingQuestions(sessionId);
	const next = [...existing];
	const index = next.findIndex((item) => item.block.id === block.id);
	const candidate = { messageId, block };
	if (index >= 0) {
		next[index] = candidate;
	} else {
		next.push(candidate);
	}
	writePersistedPendingQuestions(sessionId, next);
}

export function updatePersistedPendingQuestion(
	sessionId: string,
	blockId: string,
	updater: (entry: PersistedPendingQuestion) => PersistedPendingQuestion,
) {
	const existing = readPersistedPendingQuestions(sessionId);
	const next = existing.map((entry) => (entry.block.id === blockId ? updater(entry) : entry));
	writePersistedPendingQuestions(sessionId, next);
}

export function removePersistedPendingQuestion(sessionId: string, blockId: string) {
	const existing = readPersistedPendingQuestions(sessionId);
	writePersistedPendingQuestions(
		sessionId,
		existing.filter((entry) => entry.block.id !== blockId),
	);
}

export function mergePersistedPendingQuestions(
	messages: ReturnType<typeof normalizeOpenCodeMessage>[],
	persisted: PersistedPendingQuestion[],
) {
	if (persisted.length === 0) return messages;
	const byMessageId = new Map<string, ChatQuestionBlock[]>();
	persisted.forEach((entry) => {
		const blocks = byMessageId.get(entry.messageId) || [];
		blocks.push(entry.block);
		byMessageId.set(entry.messageId, blocks);
	});
	return messages.map((message) => {
		const persistedBlocks = byMessageId.get(message.id);
		if (!persistedBlocks || persistedBlocks.length === 0) return message;
		let questionBlocks = message.questionBlocks;
		persistedBlocks.forEach((block) => {
			questionBlocks = mergeQuestionBlocks(questionBlocks, block);
		});
		return { ...message, questionBlocks };
	});
}
