/**
 * MessageBubble - Compact message rows for chat UI
 */

import { memo, useState } from "react";
import { Copy, Check, Coins, Clock, RotateCcw, AlertCircle, CheckCircle2, XCircle, ChevronDown, MessageSquareQuote, GitBranchPlus } from "lucide-react";
import MDRender from "../../components/editor/MDRender";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolCallList } from "./ToolCallBlock";
import { ShellCallList, isShellToolName } from "./ShellCallBlock";
import type { ChatMessage, ChatQuestionBlock } from "../../models/chat";
import { isQuestionToolName } from "../organisms/ChatPage/helpers";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";

interface MessageBubbleProps {
	message: ChatMessage;
	parentSessionId?: string;
	showModel?: boolean;
	showMetadata?: boolean;
	isLastUserMessage?: boolean;
	onSubmitQuestion?: (messageId: string, blockId: string, answers: string[][]) => Promise<void> | void;
	onRejectQuestion?: (messageId: string, blockId: string) => Promise<void> | void;
	onRevert?: (messageId: string) => void;
	onFork?: (messageId: string) => void;
	onPreviewTask?: (taskId: string) => void;
	onPreviewDoc?: (docPath: string) => void;
}

export const MessageBubble = memo(function MessageBubble({
	message,
	parentSessionId,
	showModel = true,
	showMetadata = true,
	isLastUserMessage = false,
	onSubmitQuestion,
	onRejectQuestion,
	onRevert,
	onFork,
	onPreviewTask,
	onPreviewDoc,
}: MessageBubbleProps) {
	const [copied, setCopied] = useState(false);
	const isUser = message.role === "user";

	const handleCopy = async () => {
		await navigator.clipboard.writeText(message.content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Format timestamp
	const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	const shellToolCalls = (message.toolCalls || []).filter((tool) => isShellToolName(tool.name));
	const nonShellToolCalls = (message.toolCalls || []).filter(
		(tool) => !isShellToolName(tool.name) && (!isQuestionToolName(tool.name) || tool.status === "success"),
	);
	const attachments = message.attachments || [];
	const hasVisibleAssistantContent =
		Boolean(message.reasoning) ||
		shellToolCalls.length > 0 ||
		nonShellToolCalls.length > 0 ||
		(message.questionBlocks?.length || 0) > 0 ||
		Boolean(message.error) ||
		Boolean(message.content) ||
		attachments.length > 0;

	if (isUser) {
		return (
			<div className="px-1">
				<div className="group relative min-w-0">
					<div className="mb-1.5 text-[11px] font-medium text-muted-foreground">You</div>
					<UserMessageBody content={message.content} attachments={attachments} />
					<MessageActionBar
						time={time}
						showOnHover
						canCopy={Boolean(message.content)}
						copied={copied}
						onCopy={handleCopy}
						canRevert={Boolean(isLastUserMessage && onRevert)}
						onRevert={() => onRevert?.(message.id)}
						canFork={Boolean(onFork)}
						onFork={() => onFork?.(message.id)}
						revertTitle="Revert — remove this message and restore to input"
					/>
				</div>
			</div>
		);
	}

	if (!hasVisibleAssistantContent) {
		return null;
	}

	return (
		<div className="px-1">
			<div className="min-w-0">
				<AssistantReasoningSection reasoning={message.reasoning} />
				<AssistantToolSection
					shellToolCalls={shellToolCalls}
					nonShellToolCalls={nonShellToolCalls}
					parentSessionId={parentSessionId}
					messageId={message.id}
					messageCreatedAt={message.createdAt}
				/>
				<AssistantQuestionSection blocks={message.questionBlocks || []} />
				<AssistantErrorSection error={message.error} />
				<AssistantContentSection
					content={message.content}
					attachments={attachments}
					copied={copied}
					onCopy={handleCopy}
					onRevert={onRevert ? () => onRevert(message.id) : undefined}
					onFork={onFork ? () => onFork(message.id) : undefined}
					onPreviewTask={onPreviewTask}
					onPreviewDoc={onPreviewDoc}
				/>
				{showMetadata && <AssistantMetadataRow message={message} showModel={showModel} />}
			</div>
		</div>
	);
});

function UserMessageBody({
	content,
	attachments,
}: {
	content: string;
	attachments: NonNullable<ChatMessage["attachments"]>;
}) {
	return (
		<div className="min-w-0 overflow-hidden rounded-lg bg-muted/40 px-4 py-3">
			<div className="space-y-3">
				{content && <p className="min-w-0 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{content}</p>}
				<MessageAttachments attachments={attachments} />
			</div>
		</div>
	);
}

function AssistantReasoningSection({ reasoning }: { reasoning?: string }) {
	if (!reasoning) return null;
	return <ReasoningBlock markdown={reasoning} />;
}

function AssistantToolSection({
	shellToolCalls,
	nonShellToolCalls,
	parentSessionId,
	messageId,
	messageCreatedAt,
}: {
	shellToolCalls: NonNullable<ChatMessage["toolCalls"]>;
	nonShellToolCalls: NonNullable<ChatMessage["toolCalls"]>;
	parentSessionId?: string;
	messageId: string;
	messageCreatedAt: string;
}) {
	if (shellToolCalls.length === 0 && nonShellToolCalls.length === 0) return null;
	return (
		<>
			{shellToolCalls.length > 0 && <ShellCallList toolCalls={shellToolCalls} />}
			{nonShellToolCalls.length > 0 && (
				<ToolCallList
					toolCalls={nonShellToolCalls}
					parentSessionId={parentSessionId}
					messageId={messageId}
					messageCreatedAt={messageCreatedAt}
				/>
			)}
		</>
	);
}

function AssistantQuestionSection({ blocks }: { blocks: ChatQuestionBlock[] }) {
	if (blocks.length === 0) return null;
	return (
		<>
			{blocks.map((block) => (
				<QuestionSummaryBlock key={block.id} block={block} />
			))}
		</>
	);
}

function AssistantErrorSection({ error }: { error?: string }) {
	if (!error) return null;
	return (
		<div className="my-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2.5 sm:px-2.5 sm:py-2">
			<div className="flex items-start gap-2.5 sm:gap-2">
				<div className="mt-0.5 text-red-500">
					<AlertCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
				</div>
				<div className="min-w-0">
					<div className="text-sm sm:text-xs text-foreground/90">{error}</div>
				</div>
			</div>
		</div>
	);
}

function AssistantContentSection({
	content,
	attachments,
	copied,
	onCopy,
	onRevert,
	onFork,
	onPreviewTask,
	onPreviewDoc,
}: {
	content: string;
	attachments: NonNullable<ChatMessage["attachments"]>;
	copied: boolean;
	onCopy: () => void;
	onRevert?: () => void;
	onFork?: () => void;
	onPreviewTask?: (taskId: string) => void;
	onPreviewDoc?: (docPath: string) => void;
}) {
	if (!content && attachments.length === 0) return null;
	return (
		<div className="group relative">
			<div className="max-w-none py-1">
				<div className="space-y-3">
					{content && (
						<MDRender
							markdown={content}
							className="chat-markdown-compact text-sm [&_p]:text-foreground [&_li]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:text-xs"
							onTaskLinkClick={onPreviewTask}
							onDocLinkClick={onPreviewDoc}
						/>
					)}
					<MessageAttachments attachments={attachments} />
				</div>
			</div>
			<MessageActionBar
				className="absolute right-0 top-1"
				showOnHover
				canCopy={Boolean(content)}
				copied={copied}
				onCopy={onCopy}
				canRevert={Boolean(onRevert)}
				onRevert={onRevert}
				canFork={Boolean(onFork)}
				onFork={onFork}
			/>
		</div>
	);
}

function AssistantMetadataRow({
	message,
	showModel,
}: {
	message: ChatMessage;
	showModel: boolean;
}) {
	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[11px] text-muted-foreground">
			{showModel && message.model && (
				<span className="rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 capitalize">{message.model}</span>
			)}
			{message.tokens && (
				<span className="flex items-center gap-1 text-amber-500/80" title="Tokens used">
					<Coins className="h-3 w-3" />
					{message.tokens.toLocaleString()}
					{message.inputTokens && message.outputTokens && (
						<span className="text-muted-foreground/60">
							({message.inputTokens.toLocaleString()} in, {message.outputTokens.toLocaleString()} out)
						</span>
					)}
				</span>
			)}
			{typeof message.cost === "number" && message.cost > 0 && (
				<span className="flex items-center gap-1 text-emerald-500/80" title="Cost">
					${message.cost.toFixed(4)}
				</span>
			)}
			{message.duration && (
				<span className="flex items-center gap-1" title="Duration">
					<Clock className="h-3 w-3" />
					{(message.duration / 1000).toFixed(1)}s
				</span>
			)}
		</div>
	);
}

function MessageActionBar({
	time,
	showOnHover = false,
	className,
	canCopy = false,
	copied = false,
	onCopy,
	canRevert = false,
	onRevert,
	canFork = false,
	onFork,
	revertTitle = "Revert",
}: {
	time?: string;
	showOnHover?: boolean;
	className?: string;
	canCopy?: boolean;
	copied?: boolean;
	onCopy?: () => void;
	canRevert?: boolean;
	onRevert?: () => void;
	canFork?: boolean;
	onFork?: () => void;
	revertTitle?: string;
}) {
	if (!time && !canCopy && !canRevert && !canFork) return null;
	return (
		<div className={cn("mt-1 flex items-center gap-1 transition-opacity", showOnHover && "opacity-0 group-hover:opacity-100", className)}>
			{time && <span className="text-[10px] text-muted-foreground">{time}</span>}
			{canCopy && onCopy && (
				<button type="button" onClick={onCopy} className="rounded-md p-1 hover:bg-accent" title="Copy">
					{copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
				</button>
			)}
			{canRevert && onRevert && (
				<button type="button" onClick={onRevert} className="rounded-md p-1 hover:bg-accent" title={revertTitle}>
					<RotateCcw className="w-3 h-3 text-muted-foreground" />
				</button>
			)}
			{canFork && onFork && (
				<button type="button" onClick={onFork} className="rounded-md p-1 hover:bg-accent" title="Fork from here">
					<GitBranchPlus className="w-3 h-3 text-muted-foreground" />
				</button>
			)}
		</div>
	);
}

function QuestionSummaryBlock({ block }: { block: ChatQuestionBlock }) {
	const [isOpen, setIsOpen] = useState(true);
	const isRejected = block.status === "rejected";
	const isSubmitted = block.status === "submitted";
	const isPending = !isRejected && !isSubmitted;

	return (
		<div className="my-2 max-w-2xl">
			<div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
				<button
					type="button"
					onClick={() => setIsOpen(!isOpen)}
					className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 sm:py-2 text-left hover:bg-muted/50 transition-colors"
				>
					<div className="flex min-w-0 items-center gap-2.5">
						<div
							className={cn(
								"flex h-5 w-5 shrink-0 items-center justify-center rounded",
								isRejected
									? "text-red-500"
									: isPending
										? "text-blue-500"
										: "text-emerald-600",
							)}
						>
							{isRejected ? (
								<XCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
							) : isPending ? (
								<MessageSquareQuote className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
							) : (
								<CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
							)}
						</div>
						<div className="min-w-0">
							<div className="text-sm sm:text-xs font-medium text-foreground">
								{block.prompts.length} question{block.prompts.length > 1 ? "s" : ""}{" "}
								{isRejected ? "skipped" : isPending ? "pending" : "answered"}
							</div>
						</div>
					</div>
					<ChevronDown
						className={cn(
							"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
							!isOpen && "-rotate-90"
						)}
					/>
				</button>
				{isOpen && (
					<div className="space-y-2 border-t border-border/40 px-3 py-2.5 sm:py-2">
						{block.prompts.map((prompt, index) => {
							const answers = block.selectedAnswers?.[index] || [];
							return (
								<div key={`${block.id}_${index}`} className="rounded-md bg-background/60 px-2.5 py-2">
									<div className="text-sm sm:text-xs font-medium text-foreground/80">
										{prompt.question}
									</div>
									<div className="mt-1 text-sm sm:text-xs text-muted-foreground">
										{answers.length > 0 && !isRejected
											? answers.join(", ")
											: isRejected
												? "—"
												: "Waiting for answer..."}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function dataUrlToBlobUrl(url: string): string {
	if (!url.startsWith("data:")) return url;
	const [meta, data] = url.split(",", 2);
	if (!meta || !data) return url;
	const mimeMatch = meta.match(/^data:([^;]+)(;base64)?$/i);
	const mime = mimeMatch?.[1] || "application/octet-stream";
	const isBase64 = meta.includes(";base64");
	const binary = isBase64 ? atob(data) : decodeURIComponent(data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
	setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
	return blobUrl;
}

function openAttachmentInNewTab(url: string) {
	const targetUrl = dataUrlToBlobUrl(url);
	const link = document.createElement("a");
	link.href = targetUrl;
	link.target = "_blank";
	link.rel = "noreferrer";
	document.body.appendChild(link);
	link.click();
	link.remove();
}

function MessageAttachments({
	attachments,
}: {
	attachments: NonNullable<ChatMessage["attachments"]>;
}) {
	const [previewAttachment, setPreviewAttachment] = useState<NonNullable<ChatMessage["attachments"]>[number] | null>(null);

	if (attachments.length === 0) return null;

	return (
		<>
			<div className="flex flex-wrap gap-3">
				{attachments.map((attachment) => {
					if (attachment.mime.startsWith("image/")) {
						return (
							<button
								key={attachment.id}
								type="button"
								onClick={() => setPreviewAttachment(attachment)}
								className="block overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-left transition-colors hover:border-border hover:bg-accent/40"
								title={attachment.filename}
							>
								<img
									src={attachment.url}
									alt={attachment.filename}
									className="h-24 w-24 object-cover sm:h-28 sm:w-28"
								/>
							</button>
						);
					}

					return (
						<button
							key={attachment.id}
							type="button"
							onClick={() => {
								openAttachmentInNewTab(attachment.url);
							}}
							className="inline-flex items-center rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-foreground hover:bg-accent"
						>
							{attachment.filename}
						</button>
					);
				})}
			</div>
			<Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
				<DialogContent className="max-w-5xl border-border/60 bg-background/95 p-3 shadow-2xl sm:rounded-xl" hideCloseButton>
					<DialogTitle className="sr-only">{previewAttachment?.filename || "Image preview"}</DialogTitle>
					{previewAttachment && (
						<div className="overflow-hidden rounded-lg">
							<img
								src={previewAttachment.url}
								alt={previewAttachment.filename}
								className="max-h-[85vh] w-full object-contain"
							/>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}

// Streaming message bubble (for in-progress responses)
interface StreamingBubbleProps {
	content: string;
	showCursor?: boolean;
}

export const StreamingBubble = memo(function StreamingBubble({ content, showCursor = true }: StreamingBubbleProps) {
	return (
		<div className="px-3">
			<div className="min-w-0">
				<div className="max-w-none">
					<MDRender
						markdown={content}
						className="chat-markdown-compact text-sm [&_p]:text-foreground [&_li]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:text-xs"
					/>
					{showCursor && (
						<span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
					)}
				</div>
			</div>
		</div>
	);
});
