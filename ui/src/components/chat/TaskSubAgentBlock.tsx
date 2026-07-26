import { memo, useContext } from "react";
import { Bot, Loader2 } from "lucide-react";

import type { ChatSession } from "../../models/chat";
import { SubAgentBlock } from "./SubAgentBlock";
import { toTaskAgentItem } from "../organisms/ChatPage/helpers";
import { SubSessionsContext } from "../../contexts/SubSessionsContext";

type ToolCallItem = NonNullable<NonNullable<ChatSession["messages"]>[number]["toolCalls"]>[number];

interface TaskSubAgentBlockProps {
	tool: ToolCallItem;
	parentSessionId?: string;
	messageCreatedAt?: string;
}

function FallbackTaskCard({
	title,
	subtitle,
	summary,
	status,
	loading,
}: {
	title: string;
	subtitle?: string;
	summary?: string;
	status?: "loading" | "success" | "error";
	loading: boolean;
}) {
	const badge =
		loading || status === "loading"
			? { label: "Running", cls: "bg-blue-500/10 text-blue-500" }
			: status === "error"
				? { label: "Error", cls: "bg-red-500/10 text-red-500" }
				: status === "success"
					? { label: "Done", cls: "bg-emerald-500/10 text-emerald-600" }
					: { label: "Pending", cls: "bg-muted text-muted-foreground" };

	return (
		<div className="overflow-hidden rounded-lg border border-border/50 bg-muted/20">
			<div className="flex items-start gap-2.5 px-3 py-2">
				<div className="mt-0.5 shrink-0 text-muted-foreground">
					<Bot className="h-3.5 w-3.5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="min-w-0 flex-1 text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">{title}</span>
						<span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.cls}`}>
							{badge.label}
						</span>
						{(loading || status === "loading") && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
					</div>
					{subtitle && <div className="mt-0.5 break-words text-[11px] text-muted-foreground">{subtitle}</div>}
					{summary && <div className="mt-0.5 break-words text-[11px] text-muted-foreground">{summary}</div>}
				</div>
			</div>
		</div>
	);
}

export const TaskSubAgentBlock = memo(function TaskSubAgentBlock({
	tool,
	parentSessionId,
	messageCreatedAt,
}: TaskSubAgentBlockProps) {
	const agent = toTaskAgentItem(tool, { id: tool.id, createdAt: new Date().toISOString() });
	const subSessions = useContext(SubSessionsContext);
	const directSession = subSessions.getById(agent.taskId);
	const fallbackSession = directSession || subSessions.findByParent(parentSessionId, messageCreatedAt);
	const session = directSession || fallbackSession;
	const loading = !session && tool.status === "loading";

	if (session) {
		return <SubAgentBlock session={session} indented={false} />;
	}

	return (
		<FallbackTaskCard
			title={agent.title}
			subtitle={agent.subtitle}
			summary={agent.summary}
			status={tool.status}
			loading={loading}
		/>
	);
});
