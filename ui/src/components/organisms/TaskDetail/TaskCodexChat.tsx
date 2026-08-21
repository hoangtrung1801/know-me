import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, Loader2, Send, WifiOff } from "lucide-react";
import { chatApi } from "../../../api/client";
import { useSSEEvent } from "../../../contexts/SSEContext";
import type { ChatMessage, ChatSession } from "../../../models/chat";
import type {
    AgentTaskSnapshot,
    CodexStatus,
} from "../../../models/agent";
import type { Task } from "@/ui/models/task";
import { ChatThread } from "../../chat/ChatThread";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";

interface TaskCodexChatProps {
    taskId: string;
    taskStatus: Task["status"];
    snapshot: AgentTaskSnapshot | null;
    codexStatus: CodexStatus | null;
    onRefresh: () => Promise<void>;
}

function isCodexSession(session: ChatSession | null, taskId: string): boolean {
    return session?.agentType === "codex" && session.taskId === taskId;
}

function mergeChatMessages(
    base: ChatMessage[],
    updates: ChatMessage[],
): ChatMessage[] {
    const messages = [...base];
    for (const update of updates) {
        const index = messages.findIndex((message) => message.id === update.id);
        if (index < 0) messages.push(update);
        else if (update.content.trim() || !messages[index].content.trim())
            messages[index] = update;
        else messages[index] = { ...update, content: messages[index].content };
    }
    return messages;
}

export function TaskCodexChat({
    taskId,
    taskStatus,
    snapshot,
    codexStatus,
    onRefresh,
}: TaskCodexChatProps) {
    const [session, setSession] = useState<ChatSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [content, setContent] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [queueNotice, setQueueNotice] = useState<string | null>(null);
    const pendingMessagesRef = useRef(
        new Map<string, Map<string, ChatMessage>>(),
    );
    const loadRequestRef = useRef(0);

    const chatSessionId =
        snapshot?.workflow.chatSessionId || snapshot?.chatSessionId;
    const applyPendingMessages = useCallback(
        (next: ChatSession): ChatSession => {
            const pending = pendingMessagesRef.current.get(next.id);
            if (!pending || pending.size === 0) return next;
            pendingMessagesRef.current.delete(next.id);
            return {
                ...next,
                messages: mergeChatMessages(next.messages, [
                    ...pending.values(),
                ]),
            };
        },
        [],
    );

    const loadSession = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        if (!chatSessionId) {
            setSession(null);
            setLoading(false);
            return;
        }
        setSession((current) =>
            current?.id === chatSessionId ? current : null,
        );
        setLoading(true);
        try {
            const fetched = await chatApi.getSession(chatSessionId);
            if (requestId !== loadRequestRef.current) return;
            const next = applyPendingMessages(fetched);
            setSession((current) => {
                if (!current || current.id !== next.id) return next;
                return {
                    ...next,
                    messages: mergeChatMessages(
                        next.messages,
                        current.messages,
                    ),
                };
            });
            setError(null);
        } catch (reason) {
            if (requestId === loadRequestRef.current) {
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Unable to load Codex chat",
                );
            }
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false);
        }
    }, [applyPendingMessages, chatSessionId]);

    useEffect(() => {
        void loadSession();
    }, [loadSession]);

    const handleChatSession = useCallback(
        ({ session: next }: { session: ChatSession }) => {
            if (!isCodexSession(next, taskId)) return;
            const hydrated = applyPendingMessages(next);
            setSession((current) =>
                current?.id === hydrated.id
                    ? {
                          ...hydrated,
                          messages: mergeChatMessages(
                              hydrated.messages,
                              current.messages,
                          ),
                      }
                    : hydrated,
            );
        },
        [applyPendingMessages, taskId],
    );

    useSSEEvent("chats:created", handleChatSession, [handleChatSession]);
    useSSEEvent("chats:updated", handleChatSession, [handleChatSession]);

    const handleChatMessage = useCallback(
        ({ chatId, message }: { chatId: string; message: ChatMessage }) => {
            if (chatSessionId && chatSessionId !== chatId) return;
            const pending =
                pendingMessagesRef.current.get(chatId) ||
                new Map<string, ChatMessage>();
            pending.set(message.id, message);
            pendingMessagesRef.current.set(chatId, pending);
            setSession((current) => {
                if (!current || current.id !== chatId) return current;
                return applyPendingMessages(current);
            });
        },
        [applyPendingMessages, chatSessionId],
    );

    useSSEEvent("chats:message", handleChatMessage, [handleChatMessage]);

    const activeRun = useMemo(() => {
        if (!snapshot?.workflow.activeRunId) return null;
        return (
            snapshot.runs.find(
                (run) => run.id === snapshot.workflow.activeRunId,
            ) || null
        );
    }, [snapshot]);
    const phase = snapshot?.workflow.phase || "idle";
    const codexReady =
        codexStatus?.installed === true && codexStatus.loggedIn === true;
    const gatedRunActive = activeRun !== null && activeRun.phase !== "chat";
    const gatedPhase = phase === "investigating" || phase === "implementing";
    const autoEligible =
        taskStatus === "in-progress" &&
        codexReady &&
        !gatedRunActive &&
        !gatedPhase;
    const disabledReason = !codexReady
        ? codexStatus?.installed === false
            ? "Install codex-acp to chat with Codex."
            : "Sign in to Codex to chat."
        : taskStatus !== "in-progress"
          ? "Move this task to in-progress to use Auto chat."
          : gatedRunActive || gatedPhase
            ? "Auto chat is paused while Codex is investigating or implementing."
            : null;

    const handleSend = useCallback(async () => {
        const message = content.trim();
        if (!message || !session || !autoEligible || sending) return;
        setSending(true);
        setError(null);
        setQueueNotice(null);
        try {
            const response = await chatApi.sendMessage(session.id, message);
            setContent("");
            if (response.queued)
                setQueueNotice(
                    `Queued${response.position ? ` · position ${response.position}` : ""}`,
                );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Unable to send message",
            );
        } finally {
            setSending(false);
        }
    }, [autoEligible, content, sending, session]);

    const handleStop = useCallback(async () => {
        if (!session) return;
        setSending(true);
        try {
            await chatApi.stopChat(session.id);
            await Promise.all([loadSession(), onRefresh()]);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Unable to stop Codex chat",
            );
        } finally {
            setSending(false);
        }
    }, [loadSession, onRefresh, session]);

    return (
        <div
            className="flex min-h-0 flex-1 flex-col"
            data-testid="task-codex-chat"
        >
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Codex chat</span>
                        <Badge variant="outline" className="text-[10px]">
                            Auto
                        </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                        {queueNotice ||
                            (session?.messageQueue?.length
                                ? `${session.messageQueue.length} message${session.messageQueue.length === 1 ? "" : "s"} queued`
                                : session?.status === "streaming"
                                  ? "Working in the task workspace"
                                  : "One persistent conversation for this task")}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {session?.status === "streaming" && (
                        <Loader2
                            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                            aria-label="Codex is working"
                        />
                    )}
                    {session?.status === "streaming" && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => void handleStop()}
                            disabled={sending}
                            title="Stop Auto chat"
                        >
                            <CircleStop className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
                {loading && !session ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading
                        history…
                    </div>
                ) : session ? (
                    session.messages.length > 0 ||
                    session.status === "streaming" ? (
                        <ChatThread session={session} bubble showAllMessages />
                    ) : (
                        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
                            Ask Codex about this task. Messages and workflow
                            replies stay here.
                        </div>
                    )
                ) : (
                    <div className="flex h-full items-center justify-center gap-2 px-8 text-center text-sm text-muted-foreground">
                        <WifiOff className="h-4 w-4" /> Task chat is not
                        available yet.
                    </div>
                )}
            </div>

            <div className="border-t border-border/40 p-3">
                {error && (
                    <p
                        className="mb-2 max-h-20 overflow-y-auto break-words whitespace-pre-wrap text-xs leading-4 text-destructive"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
                {disabledReason && (
                    <p className="mb-2 text-xs text-muted-foreground">
                        {disabledReason}
                    </p>
                )}
                <div className="flex items-end gap-2">
                    <Textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void handleSend();
                            }
                        }}
                        placeholder={
                            autoEligible
                                ? "Message Codex about this task…"
                                : "Auto chat unavailable while Codex is working"
                        }
                        rows={3}
                        disabled={!autoEligible || sending || !session}
                        aria-label="Message Codex about this task"
                    />
                    <Button
                        onClick={() => void handleSend()}
                        disabled={
                            !autoEligible ||
                            sending ||
                            !session ||
                            !content.trim()
                        }
                        aria-label="Send message"
                    >
                        {sending ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <Send />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
