import { Bot, Command, Loader2 } from "lucide-react";

import type { SessionAgentItem } from "../../../models/chat";
import { cn } from "../../../lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../../ui/dialog";
import { SubAgentBlock } from "../../chat/SubAgentBlock";

interface AgentActivityDialogProps {
	agent: SessionAgentItem | null;
	onOpenChange: (open: boolean) => void;
}

function getStatusLabel(status: SessionAgentItem["status"]) {
	if (status === "running") return "Running";
	if (status === "error") return "Error";
	return "Done";
}

function getStatusClasses(status: SessionAgentItem["status"]) {
	if (status === "running") return "bg-blue-500/10 text-blue-500";
	if (status === "error") return "bg-red-500/10 text-red-500";
	return "bg-emerald-500/10 text-emerald-600";
}

function AgentField({
	label,
	value,
	mono = false,
}: {
	label: string;
	value?: string;
	mono?: boolean;
}) {
	if (!value) return null;

	return (
		<div className="space-y-1 rounded-xl border border-border/60 bg-background/80 p-3">
			<div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
			<div className={cn("whitespace-pre-wrap break-words text-sm text-foreground", mono && "font-mono text-xs")}>
				{value}
			</div>
		</div>
	);
}

function TaskAgentDetail({ agent }: { agent: Extract<SessionAgentItem, { kind: "task" }> }) {
	return (
		<div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
			<div className="flex items-start gap-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Command className="h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<div className="truncate text-sm font-semibold text-foreground">{agent.title}</div>
						<span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", getStatusClasses(agent.status))}>
							{getStatusLabel(agent.status)}
						</span>
						{agent.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
					</div>
					{agent.subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{agent.subtitle}</div>}
					{agent.summary && <div className="mt-2 text-sm text-muted-foreground">{agent.summary}</div>}
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<AgentField label="Prompt" value={agent.prompt} />
				<AgentField label="Command" value={agent.command} mono />
				<AgentField label="Description" value={agent.description} />
				<AgentField label="Task ID" value={agent.taskId} mono />
			</div>

			<AgentField label="Output" value={agent.toolCall.output} mono />
		</div>
	);
}

export function AgentActivityDialog({ agent, onOpenChange }: AgentActivityDialogProps) {
	const isOpen = Boolean(agent);
	const Icon = agent?.kind === "session" ? Bot : Command;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="grid h-[min(80vh,720px)] max-w-3xl grid-rows-[auto,minmax(0,1fr)] overflow-hidden border-border/70 bg-background/95 p-0 shadow-2xl">
				<div className="border-b border-border/70 px-6 py-5">
					<DialogHeader className="space-y-2 text-left">
						<DialogTitle className="flex items-center gap-2 text-2xl font-semibold">
							<Icon className="h-5 w-5 text-primary" />
							{agent?.title || "Agent activity"}
						</DialogTitle>
						<DialogDescription className="text-sm text-muted-foreground">
							{agent?.subtitle || (agent?.kind === "session" ? "Inspect messages and status for this agent." : "Inspect the delegated task, command, and output.")}
						</DialogDescription>
					</DialogHeader>
				</div>
				<div className="min-h-0 overflow-y-auto px-6 py-5">
					{agent ? (
						agent.kind === "session" ? (
							<SubAgentBlock session={agent.session} indented={false} />
						) : (
							<TaskAgentDetail agent={agent} />
						)
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
