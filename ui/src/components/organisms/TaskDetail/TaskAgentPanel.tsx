import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CircleStop, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { codexAgentApi } from "../../../api/client";
import { useSSEEvent } from "../../../contexts/SSEContext";
import type {
	AgentAction,
	AgentEvent,
	AgentPhase,
	AgentTaskSnapshot,
	CodexStatus,
} from "../../../models/agent";
import type { Task } from "@/ui/models/task";

interface TaskAgentPanelProps {
	task: Task;
}

const phaseLabels: Record<AgentPhase, string> = {
	idle: "Idle",
	investigating: "Investigating",
	"plan-review": "Plan review",
	implementing: "Implementing",
	"code-review": "Code review",
	"fix-ready": "Fix ready",
	completed: "Completed",
};

function phaseTone(phase: AgentPhase): "default" | "secondary" | "outline" {
	if (phase === "completed") return "default";
	if (phase === "plan-review" || phase === "code-review" || phase === "fix-ready") return "secondary";
	return "outline";
}

function isReviewPhase(phase: AgentPhase): boolean {
	return phase === "plan-review" || phase === "code-review";
}

export function TaskAgentPanel({ task }: TaskAgentPanelProps) {
	const [snapshot, setSnapshot] = useState<AgentTaskSnapshot | null>(null);
	const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
	const [comment, setComment] = useState("");
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState<AgentAction | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<string | null>(null);
	const [log, setLog] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		const [statusResult, snapshotResult] = await Promise.allSettled([
			codexAgentApi.status(),
			codexAgentApi.snapshot(task.id),
		]);
		if (statusResult.status === "fulfilled") setCodexStatus(statusResult.value);
		if (snapshotResult.status === "fulfilled") {
			setSnapshot(snapshotResult.value);
			setError(null);
		} else {
			setError(snapshotResult.reason instanceof Error ? snapshotResult.reason.message : "Unable to load Codex workflow");
		}
		setLoading(false);
	}, [task.id]);

	useEffect(() => {
		void load();
	}, [load]);

	const handleAgentEvent = useCallback((event: AgentEvent) => {
		if (event.taskId !== task.id) return;
		if (event.message) setProgress(event.message);
		if (event.type !== "progress") void load();
	}, [load, task.id]);

	useSSEEvent("agent:updated", handleAgentEvent, [handleAgentEvent]);
	useSSEEvent("agent:progress", handleAgentEvent, [handleAgentEvent]);

	const runAction = useCallback(async (nextAction: AgentAction) => {
		setAction(nextAction);
		setError(null);
		setProgress(null);
		try {
			setSnapshot(await codexAgentApi.action(task.id, nextAction, comment));
			if (nextAction === "request-plan-changes" || nextAction === "request-implementation-changes") {
				setComment("");
			}
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Codex action failed");
		} finally {
			setAction(null);
		}
	}, [comment, task.id]);

	const latestRun = useMemo(
		() => snapshot?.runs[snapshot.runs.length - 1],
		[snapshot],
	);
	const phase = snapshot?.workflow.phase || "idle";
	const codexReady = codexStatus?.installed === true && codexStatus.loggedIn === true;
	const commentAction = phase === "plan-review" ? "request-plan-changes" : "request-implementation-changes";
	const busy = action !== null;

	const loadLog = async () => {
		if (!latestRun) return;
		try {
			setLog((await codexAgentApi.log(task.id, latestRun.id)).content);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Unable to load run log");
		}
	};

	return (
		<section
			role="region"
			aria-labelledby="codex-agent-title"
			className="border-t border-border/40 py-8"
			aria-live="polite"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 id="codex-agent-title" className="text-base font-semibold">Coding agent</h3>
					<p className="mt-1 text-sm text-muted-foreground">Codex investigates, implements, and waits for your review at each gate.</p>
				</div>
				<Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || busy}>
					<RefreshCw className={loading ? "animate-spin" : ""} />
					Refresh
				</Button>
			</div>

			{loading && !snapshot ? (
				<div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="animate-spin" /> Loading Codex workflow…
				</div>
			) : (
				<>
					<div className="mt-4 flex flex-wrap items-center gap-2">
						<Badge variant={phaseTone(phase)}>{phaseLabels[phase]}</Badge>
						{snapshot?.workflow.activeRunId && <span className="text-xs text-muted-foreground">Run in progress</span>}
					</div>

					{codexStatus && !codexReady && (
						<div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
							<AlertTriangle className="mt-0.5 shrink-0" />
							<span>{codexStatus.installed ? "Sign in to Codex before starting a run." : "Install Codex before starting a run."}</span>
						</div>
					)}

					{progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
					{error && <p className="mt-3 text-sm text-destructive">{error}</p>}

					<div className="mt-4 flex flex-wrap gap-2">
						{phase === "idle" && (
							<Button onClick={() => void runAction("start-investigation")} disabled={busy || !codexReady || task.status !== "in-progress"}>
								<Play /> Start investigation
							</Button>
						)}
						{(phase === "investigating" || phase === "implementing") && (
							<Button variant="outline" onClick={() => void runAction("cancel")} disabled={busy}>
								<CircleStop /> Cancel run
							</Button>
						)}
						{phase === "plan-review" && (
							<Button onClick={() => void runAction("approve-plan")} disabled={busy || !codexReady}>
								<Play /> Approve plan and implement
							</Button>
						)}
						{phase === "fix-ready" && (
							<Button onClick={() => void runAction("start-fix")} disabled={busy || !codexReady}>
								<Play /> Start fix
							</Button>
						)}
						{phase === "code-review" && (
							<Button onClick={() => void runAction("approve-implementation")} disabled={busy}>
								<Check /> Approve implementation
							</Button>
						)}
					</div>

					{isReviewPhase(phase) && (
						<div className="mt-4 space-y-2">
							<label htmlFor="codex-review-comment" className="text-sm font-medium">Review comment</label>
							<Textarea
								id="codex-review-comment"
								value={comment}
								onChange={(event) => setComment(event.target.value)}
								placeholder="Describe what Codex should change"
								rows={3}
								disabled={busy}
							/>
							<Button variant="outline" onClick={() => void runAction(commentAction)} disabled={busy || !comment.trim()}>
								Request changes
							</Button>
						</div>
					)}

					{latestRun && (
						<div className="mt-5 rounded-md border border-border/50 p-3 text-sm">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-medium">Latest run · {latestRun.phase}</span>
								<Badge variant={latestRun.status === "succeeded" ? "secondary" : "outline"}>{latestRun.status}</Badge>
							</div>
							{latestRun.summary && <p className="mt-2 text-muted-foreground">{latestRun.summary}</p>}
							{latestRun.tests && latestRun.tests.length > 0 && (
								<ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
									{latestRun.tests.map((test) => <li key={test}>{test}</li>)}
								</ul>
							)}
							{latestRun.error && <p className="mt-2 text-destructive">{latestRun.error}</p>}
							<Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={() => void loadLog()}>
								View run log
							</Button>
							{log && <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{log}</pre>}
						</div>
					)}

					{snapshot && snapshot.reviewComments.length > 0 && (
						<div className="mt-5">
							<h4 className="text-sm font-medium">Review history</h4>
							<ul className="mt-2 space-y-2">
								{snapshot.reviewComments.map((review) => (
									<li key={review.id} className="rounded-md border border-border/50 p-3 text-sm">
										<div className="flex items-center gap-2">
											<Badge variant="outline">{review.stage === "plan" ? "Plan review" : "Implementation review"}</Badge>
										</div>
										<p className="mt-2 whitespace-pre-wrap text-muted-foreground">{review.body}</p>
									</li>
								))}
							</ul>
						</div>
					)}

					{snapshot && snapshot.dirtyFiles.length > 0 && (
						<div className="mt-5 rounded-md border border-amber-200 p-3 text-sm dark:border-amber-900">
							<p className="font-medium">Workspace changes</p>
							<ul className="mt-2 list-disc pl-5 text-muted-foreground">
								{snapshot.dirtyFiles.map((file) => <li key={file}>{file}</li>)}
							</ul>
						</div>
					)}
				</>
			)}
		</section>
	);
}
