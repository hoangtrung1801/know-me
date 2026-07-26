import { useState } from "react";
import { Bot } from "lucide-react";

import type { ChatSession } from "../../../models/chat";
import { Button } from "../../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../../ui/dialog";
import { SubAgentBlock } from "../../chat/SubAgentBlock";

interface SubAgentDialogProps {
	subSessions: ChatSession[];
}

export function SubAgentDialog({ subSessions }: SubAgentDialogProps) {
	const [open, setOpen] = useState(false);
	const count = subSessions.length;

	if (count === 0) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				className="inline-flex shrink-0 items-center gap-2 rounded-lg border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
				title={count === 1 ? "Open sub-agent activity" : `Open ${count} sub-agents`}
			>
				<Bot className="h-3.5 w-3.5 text-primary" />
				<span>Open {count === 1 ? "agent" : `${count} agents`}</span>
			</Button>
			<DialogContent className="grid h-[min(80vh,720px)] max-w-3xl grid-rows-[auto,minmax(0,1fr)] overflow-hidden border-border/70 bg-background/95 p-0 shadow-2xl">
				<div className="border-b border-border/70 px-6 py-5">
					<DialogHeader className="space-y-2 text-left">
						<DialogTitle className="flex items-center gap-2 text-2xl font-semibold">
							<Bot className="h-5 w-5 text-primary" />
							Sub-agent activity
						</DialogTitle>
						<DialogDescription className="text-sm text-muted-foreground">
							Inspect messages and status for {count} running or completed sub-agent{count === 1 ? "" : "s"} in this chat session.
						</DialogDescription>
					</DialogHeader>
				</div>
				<div className="min-h-0 overflow-y-auto px-6 py-5">
					<div className="space-y-3">
						{subSessions.map((subSession) => (
							<SubAgentBlock key={subSession.id} session={subSession} indented={false} />
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
