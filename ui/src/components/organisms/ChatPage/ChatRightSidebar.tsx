import type { RefObject } from "react";
import { Activity, Bot, Clock3, GitBranchPlus, Loader2, PanelRight, RotateCcw } from "lucide-react";
import { cn } from "../../../lib/utils";

import type { ChatSession } from "../../../models/chat";
import type { OpenCodeStatus } from "../../../api/client";

interface ChatRightSidebarProps {
	session: ChatSession;
	parentSession?: ChatSession | null;
	subSessions: ChatSession[];
	runtimeStatus?: OpenCodeStatus | null;
	onOpenTimeline?: () => void;
	onRevertMessage?: (messageId: string) => void;
	onForkMessage?: (messageId: string) => void;
	subAgentSectionRef?: RefObject<HTMLDivElement | null>;
	onSubagentClick?: (session: ChatSession) => void;
}

export function ChatRightSidebar({
	session,
	parentSession,
	subSessions,
	runtimeStatus,
	onOpenTimeline,
	onRevertMessage,
	onForkMessage,
	subAgentSectionRef,
	onSubagentClick,
}: ChatRightSidebarProps) {
	const latestMessage = session.messages[session.messages.length - 1];
	const runtimeTone = runtimeStatus?.state === "ready"
		? "text-emerald-600"
		: runtimeStatus?.state === "degraded"
			? "text-amber-600"
			: "text-red-500";
	const runtimeLabel = runtimeStatus?.state || (runtimeStatus?.available ? "ready" : "unavailable");

	return (
		<aside className="hidden w-[300px] shrink-0 border-l border-border/70 bg-muted/10 lg:flex lg:flex-col xl:w-[328px] animate-in slide-in-from-right duration-200">
			<div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
				<div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<PanelRight className="h-4 w-4" />
				</div>
				<div>
					<div className="text-sm font-semibold text-foreground">Session Sidebar</div>
					<div className="text-xs text-muted-foreground">Context and agent activity</div>
				</div>
			</div>

			<div className="flex-1 space-y-3 overflow-y-auto p-3">
				<section className="space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3">
					<div className="flex items-center justify-between gap-2">
						<div>
							<div className="text-sm font-semibold text-foreground">Runtime</div>
							<div className="text-xs text-muted-foreground">OpenCode session status</div>
						</div>
						<span className={`text-xs font-medium capitalize ${runtimeTone}`}>{runtimeLabel}</span>
					</div>
					<div className="space-y-1 text-xs text-muted-foreground">
						<div>Mode: <span className="text-foreground/90">{runtimeStatus?.mode || "managed"}</span></div>
						<div>Host: <span className="text-foreground/90">{runtimeStatus?.host || "-"}:{runtimeStatus?.port || 0}</span></div>
						{runtimeStatus?.version && <div>Version: <span className="text-foreground/90">{runtimeStatus.version}</span></div>}
						{runtimeStatus?.lastError && <div className="text-red-500">{runtimeStatus.lastError}</div>}
					</div>
				</section>

				<section className="space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3">
					<div>
						<div className="text-sm font-semibold text-foreground">History</div>
						<div className="text-xs text-muted-foreground">Jump, revert, or branch from message history</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{onOpenTimeline && (
							<button type="button" onClick={onOpenTimeline} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
								<Clock3 className="h-3.5 w-3.5" />
								Open timeline
							</button>
						)}
						{latestMessage && onRevertMessage && (
							<button type="button" onClick={() => onRevertMessage(latestMessage.id)} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
								<RotateCcw className="h-3.5 w-3.5" />
								Revert latest
							</button>
						)}
						{latestMessage && onForkMessage && (
							<button type="button" onClick={() => onForkMessage(latestMessage.id)} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
								<GitBranchPlus className="h-3.5 w-3.5" />
								Fork latest
							</button>
						)}
					</div>
				</section>

				<section className="space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3">
					<div className="flex items-center gap-2">
						<Activity className="h-4 w-4 text-primary" />
						<div className="text-sm font-semibold text-foreground">Branch context</div>
					</div>
					<div className="space-y-1 text-xs text-muted-foreground">
						<div>Session ID: <span className="text-foreground/90">{session.id}</span></div>
						<div>Parent session: <span className="text-foreground/90">{parentSession?.title || session.parentSessionId || "Root session"}</span></div>
						<div>Parent message: <span className="text-foreground/90">{session.parentMessageId || "-"}</span></div>
						<div>Messages: <span className="text-foreground/90">{session.messages.length}</span></div>
					</div>
				</section>

				<section ref={subAgentSectionRef} className="space-y-3">
					<div className="flex items-center gap-2 px-1">
						<Bot className="h-4 w-4 text-primary" />
						<h3 className="text-sm font-semibold text-foreground">
							Sub-agent{subSessions.length !== 1 ? "s" : ""}
						</h3>
						{Boolean(subSessions.length) && (
							<span className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
								{subSessions.length}
							</span>
						)}
					</div>

				{subSessions.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-3 py-5 text-sm text-muted-foreground">
							No sub-agent activity in this session yet.
						</div>
					) : (
						<div className="space-y-0.5">
							{subSessions.map((subSession) => (
								<button
									key={subSession.id}
									type="button"
									onClick={() => onSubagentClick?.(subSession)}
									className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
								>
									{subSession.status === "streaming" ? (
										<Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
									) : (
										<Bot className="h-3 w-3 shrink-0 text-muted-foreground" />
									)}
									<span className="min-w-0 flex-1 truncate text-xs text-foreground">{subSession.title}</span>
									<span className={cn(
										"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
										subSession.status === "streaming"
											? "bg-blue-500/10 text-blue-500"
											: subSession.status === "error"
												? "bg-red-500/10 text-red-500"
												: "bg-emerald-500/10 text-emerald-600",
									)}>
										{subSession.status === "streaming" ? "Running" : subSession.status === "error" ? "Error" : "Done"}
									</span>
								</button>
							))}
						</div>
					)}
				</section>
			</div>
		</aside>
	);
}
