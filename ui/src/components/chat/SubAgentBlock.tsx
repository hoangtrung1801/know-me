import { memo, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Loader2, ShieldAlert } from "lucide-react";

import type { ChatSession } from "../../models/chat";
import { getModelRefLabel } from "../../lib/opencodeModels";
import { cn } from "../../lib/utils";
import { ChatThread } from "./ChatThread";

function summarizePermissions(session: ChatSession): string | null {
	if (!session.permissions || session.permissions.length === 0) return null;
	const denied = session.permissions.filter((permission) => permission.action === "deny");
	if (denied.length === 0) return null;
	return denied.map((permission) => permission.permission).join(", ");
}

export const SubAgentBlock = memo(function SubAgentBlock({
	session,
	forceExpandKey,
	indented = true,
	onOpenModal,
}: {
	session: ChatSession;
	forceExpandKey?: number;
	indented?: boolean;
	onOpenModal?: (session: ChatSession) => void;
}) {
	const [expanded, setExpanded] = useState(session.status === "streaming");
	const time = new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	const permissionSummary = useMemo(() => summarizePermissions(session), [session]);
	const latestAssistant = [...session.messages].reverse().find((message) => message.role === "assistant");
	const subtitleParts = [
		session.agent,
		session.mode,
		session.model ? getModelRefLabel(session.model) : undefined,
	]
		.filter(Boolean)
		.join(" · ");

	useEffect(() => {
		if (forceExpandKey) {
			setExpanded(true);
		}
	}, [forceExpandKey]);

	useEffect(() => {
		if (session.status === "streaming" || session.status === "error") {
			setExpanded(true);
		}
	}, [session.status]);

	return (
		<div className={cn(indented && "ml-3 sm:ml-6", "overflow-hidden rounded-lg border border-border/50 bg-muted/20")}>
			<button
				type="button"
				onClick={() => onOpenModal ? onOpenModal(session) : setExpanded((value) => !value)}
				className="flex w-full items-start gap-2.5 px-3 py-2.5 sm:py-2 text-left transition-colors hover:bg-muted/40"
			>
				<div className="mt-0.5 shrink-0 text-muted-foreground">
					<Bot className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="min-w-0 flex-1 text-sm sm:text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">{session.title}</span>
						<span
							className={cn(
								"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
								session.status === "streaming"
									? "bg-blue-500/10 text-blue-500"
									: session.status === "error"
										? "bg-red-500/10 text-red-500"
										: "bg-emerald-500/10 text-emerald-600",
							)}
						>
							{session.status === "streaming" ? "Running" : session.status === "error" ? "Error" : "Done"}
						</span>
						{session.status === "streaming" && <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin text-blue-500 shrink-0" />}
					</div>
					{subtitleParts && (
						<div className="mt-0.5 break-words text-xs sm:text-[11px] text-muted-foreground">{subtitleParts}</div>
					)}
					{session.error && (
						<div className="mt-0.5 line-clamp-1 text-xs sm:text-[11px] text-red-500">
							{session.error}
						</div>
					)}
					{permissionSummary && (
						<div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 sm:px-2 sm:py-0.5 text-xs sm:text-[10px] text-amber-700">
							<ShieldAlert className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
							Denied: {permissionSummary}
						</div>
					)}
				</div>
				<div className="mt-0.5 flex shrink-0 items-center gap-2 sm:gap-1.5 self-start">
					<span className="text-xs sm:text-[11px] text-muted-foreground">{time}</span>
					{!onOpenModal && (expanded ? (
						<ChevronDown className="w-4 h-4 text-muted-foreground" />
					) : (
						<ChevronRight className="w-4 h-4 text-muted-foreground" />
					))}
				</div>
			</button>
			{!onOpenModal && expanded && (
				<div className="border-t border-border/40 bg-background/40 py-2">
					{session.messages.length === 0 ? (
						<div className="px-3 text-sm text-muted-foreground">Sub-agent started. Waiting for messages...</div>
					) : (
						<ChatThread session={session} compact />
					)}
				</div>
			)}
		</div>
	);
});
