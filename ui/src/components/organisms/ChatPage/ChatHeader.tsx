import { Clock3, Menu, PanelRight } from "lucide-react";
import type { ChatSession } from "../../../models/chat";
import { getModelRefLabel } from "../../../lib/opencodeModels";

interface ChatHeaderProps {
	session: ChatSession;
	onMenuToggle?: () => void;
	onOpenTimeline?: () => void;
	onToggleRightSidebar?: () => void;
	rightSidebarOpen?: boolean;
}

export function ChatHeader({ session, onMenuToggle, onOpenTimeline, onToggleRightSidebar, rightSidebarOpen }: ChatHeaderProps) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-b border-border/50 bg-background px-3 py-3 sm:px-5">
			{onMenuToggle && (
				<button
					type="button"
					onClick={onMenuToggle}
					className="flex md:hidden shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
					title="Open sidebar"
				>
					<Menu className="h-5 w-5" />
				</button>
			)}
			<div className="min-w-0 flex-1 space-y-1">
				<div className="truncate text-base font-semibold tracking-[-0.01em]">{session.title || "New Chat"}</div>
				<div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
					<span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 capitalize">
						{session.agentType}
					</span>
					{session.model && (
						<span className="truncate rounded-md border border-border/60 bg-muted/30 px-2 py-0.5">
							{getModelRefLabel(session.model)}
						</span>
					)}
					<span>{session.messages.length} message{session.messages.length !== 1 ? "s" : ""}</span>
				</div>
			</div>
			{onOpenTimeline && (
				<button
					type="button"
					onClick={onOpenTimeline}
					className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					title="Open timeline"
				>
					<Clock3 className="h-4 w-4" />
				</button>
			)}
			{onToggleRightSidebar && (
				<button
					type="button"
					onClick={onToggleRightSidebar}
					className={`hidden lg:flex shrink-0 items-center justify-center rounded-md p-2 transition-colors hover:bg-accent hover:text-foreground ${rightSidebarOpen ? "text-foreground bg-accent" : "text-muted-foreground"}`}
					title={rightSidebarOpen ? "Hide session sidebar" : "Show session sidebar"}
				>
					<PanelRight className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
