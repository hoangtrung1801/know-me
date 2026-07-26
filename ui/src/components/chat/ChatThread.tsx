import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";

import type { ChatMessage, ChatSession } from "../../models/chat";
import MDRender from "../editor/MDRender";
import { MessageBubble } from "./MessageBubble";
import { ReasoningBlock } from "./ReasoningBlock";
import { ShellCallList, isShellToolName } from "./ShellCallBlock";
import { ToolCallList } from "./ToolCallBlock";
import {
	getLastAssistantMessageIndex,
	isLastAssistantMessageInGroup,
	isQuestionToolName,
} from "../organisms/ChatPage/helpers";

interface ChatThreadProps {
	session: ChatSession;
	onSubmitQuestion?: (messageId: string, blockId: string, answers: string[][]) => Promise<void> | void;
	onRejectQuestion?: (messageId: string, blockId: string) => Promise<void> | void;
	onRevert?: (messageId: string) => void;
	onFork?: (messageId: string) => void;
	onPreviewTask?: (taskId: string) => void;
	onPreviewDoc?: (docPath: string) => void;
	compact?: boolean;
	focusedMessageId?: string | null;
}

function isExplorationOnlyMessage(message: ChatMessage): boolean {
	if (message.role !== "assistant") return false;
	if (message.content.trim()) return false;
	if (!message.toolCalls || message.toolCalls.length === 0) return false;

	return message.toolCalls.every((tool) => {
		const name = tool.name.toLowerCase();
		return (
			name === "read" ||
			name === "read_file" ||
			name === "grep" ||
			name === "search" ||
			name === "glob" ||
			name === "list_directory"
		);
	});
}

type RenderItem =
	| { type: "message"; message: ChatMessage; index: number }
	| { type: "explored"; id: string; toolCalls: NonNullable<ChatMessage["toolCalls"]> }
	| { type: "compaction"; message: ChatMessage; index: number };

function WorkingIndicator({ compact = false }: { compact?: boolean }) {
	return (
		<div className={compact ? "flex items-center gap-2 px-2 py-1.5" : "flex items-center gap-2 px-2 py-3"}>
			<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
			<span className="text-sm text-muted-foreground">Working...</span>
		</div>
	);
}

function StreamingResponse({
	session,
	onSubmitQuestion,
	onRejectQuestion,
	onPreviewTask,
	onPreviewDoc,
	shouldAutoScroll = true,
}: {
	session: ChatSession;
	onSubmitQuestion?: (messageId: string, blockId: string, answers: string[][]) => Promise<void> | void;
	onRejectQuestion?: (messageId: string, blockId: string) => Promise<void> | void;
	onPreviewTask?: (taskId: string) => void;
	onPreviewDoc?: (docPath: string) => void;
	shouldAutoScroll?: boolean;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const lastAssistantMessage = useMemo(() => {
		for (let index = session.messages.length - 1; index >= 0; index -= 1) {
			if (session.messages[index]?.role === "assistant") return session.messages[index];
		}
		return null;
	}, [session.messages]);

	const currentText = lastAssistantMessage?.content || "";
	const currentThinking = lastAssistantMessage?.reasoning || "";
	const currentToolCalls = lastAssistantMessage?.toolCalls || [];
	const currentShellToolCalls = currentToolCalls.filter((tool) => isShellToolName(tool.name));
	const currentNonShellToolCalls = currentToolCalls.filter(
		(tool) => !isShellToolName(tool.name) && (!isQuestionToolName(tool.name) || tool.status === "success"),
	);
	const hasContent =
		currentText ||
		currentThinking ||
		currentShellToolCalls.length > 0 ||
		currentNonShellToolCalls.length > 0;
	const isComplete = session.status !== "streaming";
	const showWorkingIndicator = !isComplete && !currentThinking;

	useEffect(() => {
		if (!shouldAutoScroll) return;
		scrollRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [currentText.length, currentThinking.length, currentShellToolCalls.length, currentNonShellToolCalls.length, shouldAutoScroll]);

	if (!hasContent) {
		if (!isComplete) {
			return <WorkingIndicator />;
		}
		return null;
	}

	return (
		<div className="px-2 py-1">
			<div className="min-w-0 space-y-2">
				{showWorkingIndicator && <WorkingIndicator compact />}
				{currentThinking && <ReasoningBlock markdown={currentThinking} isStreaming={!isComplete} />}
				{currentShellToolCalls.length > 0 && <ShellCallList toolCalls={currentShellToolCalls} />}
				{currentNonShellToolCalls.length > 0 && (
					<ToolCallList
						toolCalls={currentNonShellToolCalls}
						parentSessionId={session.id}
						messageId={lastAssistantMessage?.id}
						messageCreatedAt={lastAssistantMessage?.createdAt}
					/>
				)}
				{currentText && (
					<div className="max-w-none py-1">
						<MDRender
							markdown={currentText}
							className="chat-markdown-compact text-sm [&_p]:text-foreground [&_li]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:text-xs"
							onTaskLinkClick={onPreviewTask}
							onDocLinkClick={onPreviewDoc}
						/>
						{!isComplete && (
							<span className="ml-1 inline-block h-[1.1em] w-[2px] align-text-bottom animate-cursor-blink bg-foreground rounded-[1px]" />
						)}
					</div>
				)}
				<div ref={scrollRef} />
			</div>
		</div>
	);
}

export function ChatThread({
	session,
	onSubmitQuestion,
	onRejectQuestion,
	onRevert,
	onFork,
	onPreviewTask,
	onPreviewDoc,
	compact = false,
	focusedMessageId = null,
}: ChatThreadProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const sessionIdRef = useRef<string | null>(null);
	const didSwitchSessionRef = useRef(false);
	const shouldAutoScrollRef = useRef(true);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [searchVisible, setSearchVisible] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);

	const lastAssistantIndex = useMemo(() => getLastAssistantMessageIndex(session.messages), [session.messages]);

	const lastUserMessageId = useMemo(() => {
		for (let i = session.messages.length - 1; i >= 0; i--) {
			if (session.messages[i]?.role === "user") return session.messages[i]?.id;
		}
		return undefined;
	}, [session.messages]);

	const streamingAssistantIndex = useMemo(() => {
		if (session.status !== "streaming") return -1;
		return lastAssistantIndex;
	}, [lastAssistantIndex, session.status]);

	const renderItems = useMemo(() => {
		const items: RenderItem[] = [];
		let bufferedToolCalls: NonNullable<ChatMessage["toolCalls"]> = [];
		let bufferedIds: string[] = [];

		const flushBufferedToolCalls = () => {
			if (bufferedToolCalls.length === 0) return;
			items.push({
				type: "explored",
				id: bufferedIds.join("_"),
				toolCalls: bufferedToolCalls,
			});
			bufferedToolCalls = [];
			bufferedIds = [];
		};

		session.messages.forEach((message, index) => {
			if (index === streamingAssistantIndex) return;

			// Hide empty compaction trigger messages (user message with no content)
			if (message.role === "user" && !message.content.trim() && !message.toolCalls?.length && !message.attachments?.length) {
				return;
			}

			if (isExplorationOnlyMessage(message)) {
				bufferedToolCalls = [...bufferedToolCalls, ...(message.toolCalls || [])];
				bufferedIds.push(message.id);
				return;
			}

			flushBufferedToolCalls();

			// Detect compaction summary: assistant message right after an empty user message
			const prevMsg = index > 0 ? session.messages[index - 1] : null;
			const isCompactionSummary = message.role === "assistant"
				&& prevMsg?.role === "user"
				&& !prevMsg.content.trim()
				&& !prevMsg.toolCalls?.length
				&& !prevMsg.attachments?.length;

			if (isCompactionSummary) {
				items.push({ type: "compaction", message, index });
			} else {
				items.push({ type: "message", message, index });
			}
		});

		flushBufferedToolCalls();
		return items;
	}, [session.messages, streamingAssistantIndex]);

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return renderItems;
		const q = searchQuery.toLowerCase();
		return renderItems.filter((item) => {
			if (item.type === "explored") return false;
			if (item.type === "compaction") return true;
			return item.message.content.toLowerCase().includes(q);
		});
	}, [renderItems, searchQuery]);

	// Focus search input when visible
	useEffect(() => {
		if (searchVisible) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		} else {
			setSearchQuery("");
		}
	}, [searchVisible]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const threshold = 100;
		const updateAutoScrollState = () => {
			const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
			shouldAutoScrollRef.current = distanceFromBottom <= threshold;
		};

		updateAutoScrollState();
		container.addEventListener("scroll", updateAutoScrollState, { passive: true });
		return () => container.removeEventListener("scroll", updateAutoScrollState);
	}, [session.id]);

	// Jump to bottom before paint when switching sessions.
	useLayoutEffect(() => {
		if (sessionIdRef.current === session.id) return;
		sessionIdRef.current = session.id;
		didSwitchSessionRef.current = true;
		shouldAutoScrollRef.current = true;
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
			return;
		}
		bottomRef.current?.scrollIntoView();
	}, [session.id]);

	// Scroll to bottom before paint when new messages arrive in the active session.
	useLayoutEffect(() => {
		if (didSwitchSessionRef.current) {
			didSwitchSessionRef.current = false;
			return;
		}
		if (!shouldAutoScrollRef.current) return;
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}, [session.messages.length, session.status]);

	// Observe whether bottom is visible to show/hide scroll button
	useEffect(() => {
		const el = bottomRef.current;
		const root = scrollContainerRef.current;
		if (!el || !root) return;
		const observer = new IntersectionObserver(
			([entry]) => setShowScrollButton(!(entry?.isIntersecting ?? true)),
			{ root, threshold: 0 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const scrollToBottom = () => {
		shouldAutoScrollRef.current = true;
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		if (!focusedMessageId) return;
		const el = document.getElementById(`chat-message-${focusedMessageId}`);
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [focusedMessageId]);

	return (
		<div className={compact ? "" : "relative min-h-0 flex-1"}>
			{/* Search bar */}
			{!compact && searchVisible && (
				<div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-sm">
					<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<input
						ref={searchInputRef}
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && setSearchVisible(false)}
						placeholder="Search messages..."
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					{searchQuery && (
						<span className="text-xs text-muted-foreground">
							{filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""}
						</span>
					)}
					<button
						type="button"
						onClick={() => setSearchVisible(false)}
						className="rounded p-0.5 hover:bg-muted"
					>
						<X className="h-3.5 w-3.5 text-muted-foreground" />
					</button>
				</div>
			)}
			<div ref={scrollContainerRef} className={compact ? "max-h-96 overflow-y-auto" : "absolute inset-0 overflow-y-auto"}>
				{/* Search toggle button */}
				{!compact && (
					<div className="sticky top-2 z-10 flex justify-end px-4 pointer-events-none">
						<button
							type="button"
							onClick={() => setSearchVisible((v) => !v)}
							className="pointer-events-auto rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
							title="Search messages"
						>
							<Search className="h-3.5 w-3.5" />
						</button>
					</div>
				)}
				<div className={compact ? "flex flex-col gap-4 px-3 py-4" : `mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 lg:px-8 ${searchVisible ? "pt-12" : ""}`}>
					{filteredItems.map((item) => {
						if (item.type === "explored") {
							return (
								<div key={item.id} className="px-1">
									<ToolCallList toolCalls={item.toolCalls} />
								</div>
							);
						}

						if (item.type === "compaction") {
							return (
								<div key={item.message.id} className="space-y-3">
									<div className="flex items-center gap-3 px-2 py-2">
										<div className="h-px flex-1 bg-border/60" />
										<span className="text-[11px] text-muted-foreground shrink-0">
											Session compacted
										</span>
										<div className="h-px flex-1 bg-border/60" />
									</div>
									{item.message.content.trim() && (
										<MessageBubble
											message={item.message}
											parentSessionId={session.id}
											showMetadata={false}
											isLastUserMessage={false}
											onPreviewTask={onPreviewTask}
											onPreviewDoc={onPreviewDoc}
										/>
									)}
								</div>
							);
						}

						const { message, index } = item;
						const isStreamingAssistant = session.status === "streaming" && message.role === "assistant" && index === lastAssistantIndex;
						const isGroupedAssistant = message.role === "assistant" && !isLastAssistantMessageInGroup(session.messages, index);
						const showMetadata = !isStreamingAssistant && !isGroupedAssistant;
						return (
							<div key={message.id} id={`chat-message-${message.id}`} className="space-y-3 scroll-mt-24">
								<MessageBubble
									message={message}
									parentSessionId={session.id}
									showMetadata={showMetadata}
									isLastUserMessage={message.role === "user" && message.id === lastUserMessageId}
									onSubmitQuestion={onSubmitQuestion}
									onRejectQuestion={onRejectQuestion}
									onRevert={onRevert}
									onFork={onFork}
									onPreviewTask={onPreviewTask}
									onPreviewDoc={onPreviewDoc}
								/>
							</div>
						);
					})}

					{session.status === "streaming" && (
						<StreamingResponse
							session={session}
							onSubmitQuestion={onSubmitQuestion}
							onRejectQuestion={onRejectQuestion}
							onPreviewTask={onPreviewTask}
							onPreviewDoc={onPreviewDoc}
							shouldAutoScroll={shouldAutoScrollRef.current}
						/>
					)}

					<div ref={bottomRef} />
				</div>
			</div>

			{/* Scroll to bottom button — only in full (non-compact) mode */}
			{showScrollButton && !compact && (
				<div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
					<button
						type="button"
						onClick={scrollToBottom}
						className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
					>
						<ChevronDown className="h-4 w-4" />
					</button>
				</div>
			)}
		</div>
	);
}
