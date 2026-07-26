import { Bot, Command, Loader2 } from "lucide-react";

import type { SessionAgentItem } from "../../../models/chat";
import { cn } from "../../../lib/utils";

interface SessionAgentChipProps {
	agent: SessionAgentItem;
	onClick: (agentId: string) => void;
	className?: string;
}

function getStatusClasses(status: SessionAgentItem["status"]) {
	if (status === "running") {
		return "border-primary/20 bg-primary/10 text-primary";
	}
	if (status === "error") {
		return "border-red-500/20 bg-red-500/10 text-red-600";
	}
	return "border-border/60 bg-muted/20 text-muted-foreground";
}

function StatusGlyph({ status }: { status: SessionAgentItem["status"] }) {
	if (status === "running") return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
	return <span className={cn("h-2 w-2 shrink-0 rounded-full", status === "error" ? "bg-red-500" : "bg-emerald-500")} />;
}

export function SessionAgentChip({ agent, onClick, className }: SessionAgentChipProps) {
	const Icon = agent.kind === "session" ? Bot : Command;

	return (
		<button
			type="button"
			onClick={() => onClick(agent.id)}
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-accent/70",
				getStatusClasses(agent.status),
				className,
			)}
			title={agent.subtitle || agent.title}
		>
			<Icon className="h-3 w-3 shrink-0" />
			<span className="max-w-[180px] truncate font-medium">{agent.title}</span>
			<StatusGlyph status={agent.status} />
		</button>
	);
}
