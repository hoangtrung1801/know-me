import { useMemo, useState } from "react";
import { Clock3, Copy, GitBranchPlus, RotateCcw, Search } from "lucide-react";

import type { ChatMessage, ChatSession } from "../../../models/chat";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import { cn } from "../../../lib/utils";

interface ChatTimelineDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	session: ChatSession | null;
	onJumpToMessage: (messageId: string) => void;
	onRevertMessage?: (messageId: string) => void;
	onForkMessage?: (messageId: string) => void;
}

function snippet(message: ChatMessage): string {
	return message.content.trim() || message.reasoning?.trim() || message.error || `${message.role} message`;
}

export function ChatTimelineDialog({
	open,
	onOpenChange,
	session,
	onJumpToMessage,
	onRevertMessage,
	onForkMessage,
}: ChatTimelineDialogProps) {
	const [query, setQuery] = useState("");

	const items = useMemo(() => {
		if (!session) return [];
		const normalized = query.trim().toLowerCase();
		return session.messages.filter((message) => {
			if (!normalized) return true;
			return [message.content, message.reasoning, message.error, message.id]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(normalized));
		});
	}, [query, session]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl border-border/70 bg-background/95 p-0 shadow-2xl">
				<DialogTitle className="sr-only">Timeline</DialogTitle>
				<div className="border-b border-border/60 px-4 py-3">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Clock3 className="h-4 w-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold text-foreground">Timeline</div>
							<div className="text-xs text-muted-foreground">Search, jump, revert, or fork from message history</div>
						</div>
					</div>
					<div className="relative mt-3">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search message history..."
							className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:bg-accent/40"
						/>
					</div>
				</div>

				<div className="max-h-[70vh] overflow-y-auto px-4 py-3">
					{items.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
							No matching messages.
						</div>
					) : (
						<div className="space-y-2">
							{items.map((message, index) => (
								<div key={message.id} className="rounded-xl border border-border/60 bg-card/70 px-3 py-3">
									<div className="flex items-start gap-3">
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
											{index + 1}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
												<span className={cn("rounded-md border px-1.5 py-0.5 capitalize", message.role === "assistant" ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-muted/40 text-foreground")}>{message.role}</span>
												<span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
												{message.parentMessageId && <span className="truncate">parent: {message.parentMessageId}</span>}
											</div>
											<div className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{snippet(message)}</div>
										</div>
									</div>
									<div className="mt-3 flex flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={() => {
												onJumpToMessage(message.id);
												onOpenChange(false);
											}}
											className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
										>
											Jump to message
										</button>
										{onRevertMessage && (
											<button
												type="button"
												onClick={() => {
													onRevertMessage(message.id);
													onOpenChange(false);
												}}
												className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
											>
												<RotateCcw className="h-3 w-3" />
												Revert from here
											</button>
										)}
										{onForkMessage && (
											<button
												type="button"
												onClick={() => {
													onForkMessage(message.id);
													onOpenChange(false);
												}}
												className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
											>
												<GitBranchPlus className="h-3 w-3" />
												Fork from here
											</button>
										)}
										<button
											type="button"
											onClick={() => void navigator.clipboard.writeText(snippet(message))}
											className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
										>
											<Copy className="h-3 w-3" />
											Copy
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
