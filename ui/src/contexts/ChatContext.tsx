/**
 * ChatContext — Realtime chat session state management
 *
 * - Fetches all sessions from OpenCode API on mount
 * - Subscribes to SSE for realtime updates
 * - Provides session CRUD operations
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type { ChatSession, ChatMessage } from "@/ui/models/chat";
import { opencodeApi, chatApi } from "../api/client";
import { createModelRef } from "../lib/opencodeModels";
import { useSSEEvent } from "./SSEContext";

interface ChatContextType {
	sessions: ChatSession[];
	loading: boolean;
	refreshSessions: () => Promise<void>;
}

const fallbackChatContext: ChatContextType = {
	sessions: [],
	loading: false,
	refreshSessions: async () => {},
};

const ChatContext = createContext<ChatContextType | undefined>(fallbackChatContext);

// Convert OpenCode session to ChatSession format
function toChatSession(oc: any): ChatSession {
	const model = oc.providerID && oc.modelID
		? createModelRef(oc.providerID, oc.modelID)
		: null;
	return {
		id: oc.id,
		sessionId: oc.id, // OpenCode uses id as sessionId
		title: oc.title || "New Chat",
		agentType: "opencode",
		model,
		modelSource: model ? "session" : "auto",
		parentSessionId: oc.parentID || undefined,
		permissions: Array.isArray(oc.permission) ? oc.permission : undefined,
		status: "idle",
		createdAt: new Date(oc.time?.created || Date.now()).toISOString(),
		updatedAt: new Date(oc.time?.updated || Date.now()).toISOString(),
		messages: [],
	};
}

export function ChatProvider({ children }: { children: ReactNode }) {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [loading, setLoading] = useState(true);

	const refreshSessions = useCallback(async () => {
		try {
			// Try OpenCode API first
			const ocSessions = await opencodeApi.listSessions();
			setSessions(ocSessions.map(toChatSession));
		} catch (err) {
			console.error("Failed to fetch OpenCode sessions, falling back to local:", err);
			// Fallback to local chat API
			try {
				const data = await chatApi.getSessions();
				setSessions(data);
			} catch (localErr) {
				console.error("Failed to fetch local chat sessions:", localErr);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refreshSessions();
	}, [refreshSessions]);

	// SSE: session created
	useSSEEvent(
		"chats:created" as any,
		useCallback(({ session }: { session: ChatSession }) => {
			setSessions((prev) => {
				if (prev.some((s) => s.id === session.id)) return prev;
				return [session, ...prev];
			});
		}, []),
	);

	// SSE: session updated
	useSSEEvent(
		"chats:updated" as any,
		useCallback(({ session }: { session: ChatSession }) => {
			setSessions((prev) => {
				const idx = prev.findIndex((s) => s.id === session.id);
				if (idx >= 0) {
					const next = [...prev];
					next[idx] = session;
					return next;
				}
				return [session, ...prev];
			});
		}, []),
	);

	// SSE: session deleted
	useSSEEvent(
		"chats:deleted" as any,
		useCallback(({ chatId }: { chatId: string }) => {
			setSessions((prev) => prev.filter((s) => s.id !== chatId));
		}, []),
	);

	// SSE: new message
	useSSEEvent(
		"chats:message" as any,
		useCallback(({ chatId, message }: { chatId: string; message: ChatMessage }) => {
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== chatId) return s;
					// Avoid duplicate
					if (s.messages.some((m) => m.id === message.id)) return s;
					return { ...s, messages: [...s.messages, message] };
				}),
			);
		}, []),
	);

	const value = useMemo(
		() => ({ sessions, loading, refreshSessions }),
		[sessions, loading, refreshSessions],
	);

	return (
		<ChatContext.Provider value={value}>
			{children}
		</ChatContext.Provider>
	);
}

export function useChat() {
	const context = useContext(ChatContext);
	if (context === undefined) {
		console.warn("useChat called without ChatProvider; using fallback context");
		return fallbackChatContext;
	}
	return context;
}
