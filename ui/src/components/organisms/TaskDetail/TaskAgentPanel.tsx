import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  GitBranch,
  GitCommit,
  GitMerge,
  Loader2,
  MessageSquareQuote,
  PanelRightClose,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { api, codexAgentApi } from "../../../api/client";
import { useSSEEvent } from "../../../contexts/SSEContext";
import type {
  AgentAction,
  AgentEvent,
  AgentPhase,
  AgentTaskSnapshot,
  CodexStatus,
} from "../../../models/agent";
import type { Task } from "@/ui/models/task";
import { TaskAgentChat } from "./TaskAgentChat";
import { GitDiffViewer } from "./GitDiffViewer";

interface TaskAgentPanelProps {
  task: Task;
  onTaskUpdated?: (task: Task) => void;
  onCollapse?: () => void;
  embedded?: boolean;
}

function isReviewPhase(phase: AgentPhase): boolean {
  return phase === "plan-review" || phase === "code-review" || phase === "ready-to-merge";
}

export function TaskAgentPanel({
  task,
  onTaskUpdated,
  onCollapse,
  embedded = false,
}: TaskAgentPanelProps) {
  const [snapshot, setSnapshot] = useState<AgentTaskSnapshot | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [comment, setComment] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    setCommitMessage(`feat(${task.id}): ${task.title}`);
  }, [task.id, task.title]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<AgentAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

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
      setError(
        snapshotResult.reason instanceof Error
          ? snapshotResult.reason.message
          : "Unable to load Codex workflow",
      );
    }
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshTask = useCallback(async () => {
    if (!onTaskUpdated) return;
    try {
      onTaskUpdated(await api.getTask(task.id));
    } catch {
      // The agent snapshot remains useful if the task refresh races a close.
    }
  }, [onTaskUpdated, task.id]);

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      if (event.taskId !== task.id) return;
      if (event.message === "session_info_update") {
        setProgress(null);
      } else if (event.message) {
        setProgress(event.message);
      }
      if (event.type !== "progress") {
        void load();
        if (event.taskChanged) void refreshTask();
      }
    },
    [load, refreshTask, task.id],
  );

  useSSEEvent("agent:updated", handleAgentEvent, [handleAgentEvent]);
  useSSEEvent("agent:progress", handleAgentEvent, [handleAgentEvent]);

  const runAction = useCallback(
    async (nextAction: AgentAction, actionComment?: string) => {
      setAction(nextAction);
      setError(null);
      setProgress(null);
      try {
        const payload =
          actionComment !== undefined
            ? actionComment
            : nextAction === "commit-worktree"
            ? commitMessage
            : comment;
        setSnapshot(await codexAgentApi.action(task.id, nextAction, payload));
        void refreshTask();
        if (
          nextAction === "request-plan-changes" ||
          nextAction === "request-implementation-changes"
        ) {
          setComment("");
        }
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "OMP action failed",
        );
      } finally {
        setAction(null);
      }
    },
    [comment, commitMessage, refreshTask, task.id],
  );

  const phase = snapshot?.workflow.phase || "idle";
  const codexReady =
    codexStatus?.installed === true && codexStatus.loggedIn === true;
  const commentAction =
    phase === "plan-review"
      ? "request-plan-changes"
      : "request-implementation-changes";
  const canCreateWorktree =
    phase === "plan-review" &&
    Boolean(snapshot?.dirtyFiles?.length) &&
    !snapshot?.workflow.worktreePath;
  const busy = action !== null;

  return (
    <section
      role="region"
      aria-label="Coding agent"
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "border-t border-border/40 py-8"
      }
      aria-live="polite"
    >
      {loading && !snapshot ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" /> Loading agent workflow…
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
            {snapshot?.interrupted && snapshot.resumable && (
              <Button
                size="sm"
                onClick={() => void runAction("resume")}
                disabled={busy || !codexReady || task.status !== "in-progress"}
              >
                <Play /> Resume
              </Button>
            )}
            {phase === "idle" && (
              <>
                {!snapshot?.workflow.worktreePath ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void runAction("start-agent")}
                      disabled={busy || !codexReady || task.status !== "in-progress"}
                      title="Create isolated worktree and start agent"
                    >
                      <Play /> Start OMP agent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runAction("start-investigation")}
                      disabled={busy || !codexReady || task.status !== "in-progress"}
                    >
                      <Play /> Start investigation
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="flex items-center gap-1 font-mono text-xs">
                      <GitBranch className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span>{snapshot.workflow.worktreeBranch || "worktree"}</span>
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => void runAction("start-investigation")}
                      disabled={busy || !codexReady || task.status !== "in-progress"}
                    >
                      <Play /> Start investigation
                    </Button>
                  </>
                )}
              </>
            )}
            {(phase === "investigating" || phase === "implementing") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction("cancel")}
                disabled={busy}
              >
                <CircleStop /> Cancel run
              </Button>
            )}
            {phase === "plan-review" && (
              <Button
                size="sm"
                onClick={() => void runAction("approve-plan")}
                disabled={busy || !codexReady}
              >
                <Play /> Approve plan and implement
              </Button>
            )}
            {phase === "fix-ready" && (
              <Button
                size="sm"
                onClick={() => void runAction("start-fix")}
                disabled={busy || !codexReady}
              >
                <Play /> Start fix
              </Button>
            )}
            {phase === "code-review" && (
              <>
                <Button
                  size="sm"
                  onClick={() => void runAction("commit-worktree")}
                  disabled={busy}
                >
                  <GitCommit /> Commit changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runAction("approve-implementation")}
                  disabled={busy}
                >
                  <Check /> Approve implementation
                </Button>
              </>
            )}
            {phase === "ready-to-merge" && (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => void runAction("merge-worktree")}
                  disabled={busy}
                >
                  <GitMerge /> Merge to main
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runAction("complete-without-merge")}
                  disabled={busy}
                >
                  <Check /> Complete without merge
                </Button>
              </>
            )}
            {phase === "completed" && (
              <Badge variant="outline" className="flex items-center gap-1 text-emerald-700 border-emerald-500/30 bg-emerald-500/10 dark:text-emerald-300">
                <Check className="h-3 w-3" /> Completed
              </Badge>
            )}
            {onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8"
                onClick={onCollapse}
                aria-label="Collapse agent panel"
                title="Collapse agent panel"
              >
                <PanelRightClose />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={onCollapse ? "h-8 w-8" : "ml-auto h-8 w-8"}
              onClick={() => void load()}
              disabled={loading || busy}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border/40">
              <TaskAgentChat
                taskId={task.id}
                taskStatus={task.status}
                snapshot={snapshot}
                agentStatus={codexStatus}
                onRefresh={load}
              />
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-3">
              {codexStatus && !codexReady && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 shrink-0" />
                  <span>
                    {codexStatus.installed
                      ? "Sign in to Oh My Pi (omp auth-broker) before starting a run."
                      : "Install Oh My Pi (omp) before starting a run."}
                  </span>
                </div>
              )}

            {progress && (
              <p className="text-sm text-muted-foreground">{progress}</p>
            )}
            {error && (
              <div
                className="flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">
                    Agent workflow error
                  </p>
                  <p className="mt-1 max-h-24 overflow-y-auto break-words whitespace-pre-wrap text-sm leading-5 text-destructive/80">
                    {error}
                  </p>
                </div>
              </div>
            )}
            {phase === "idle" && task.status !== "in-progress" && (
              <p className="text-sm text-muted-foreground">
                Move this task to in-progress to start the agent.
              </p>
            )}

            {(phase === "fix-ready" || canCreateWorktree) &&
              snapshot &&
              (snapshot.dirtyFiles?.length ?? 0) > 0 && (
                <details className="group rounded-md border border-amber-200 p-3 text-sm dark:border-amber-900">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    <span>Workspace changes to review</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {snapshot.dirtyFiles?.length ?? 0}
                    </span>
                  </summary>
                  <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-muted-foreground">
                    {snapshot.dirtyFiles?.map((file) => (
                      <li key={file} className="truncate" title={file}>{file}</li>
                    ))}
                  </ul>
                  {canCreateWorktree && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => void runAction("create-worktree")}
                      disabled={busy || !codexReady}
                    >
                      <GitBranch /> Create isolated worktree & retry
                    </Button>
                  )}
                </details>
              )}

            {phase === "ready-to-merge" && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Changes committed on {snapshot?.workflow.worktreeBranch || "worktree branch"}
                  </span>
                  {snapshot?.workflow.worktreeCommit && (
                    <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      {snapshot.workflow.worktreeCommit}
                    </code>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Changes are committed on the isolated worktree branch and ready to merge into your base repository branch.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => void runAction("merge-worktree")}
                    disabled={busy}
                  >
                    <GitMerge className="mr-1.5 h-3.5 w-3.5" /> Merge to main & complete task
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void runAction("complete-without-merge")}
                    disabled={busy}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Complete without merge
                  </Button>
                </div>
              </div>
            )}

            {(phase === "code-review" || phase === "ready-to-merge") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Implementation Changes (Diff)</h4>
                  {snapshot?.workflow.worktreeBranch && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {snapshot.workflow.worktreeBranch}
                    </span>
                  )}
                </div>
                <GitDiffViewer diff={snapshot?.diff} dirtyFiles={snapshot?.dirtyFiles} />
              </div>
            )}

            {phase === "code-review" && (
              <div className="rounded-md border border-border bg-card p-3 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <GitCommit className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span>Commit worktree changes</span>
                </h4>
                <div className="space-y-2">
                  <label htmlFor="commit-message" className="text-xs text-muted-foreground">
                    Commit message
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="commit-message"
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder={`feat(${task.id}): ${task.title}`}
                      disabled={busy}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={() => void runAction("commit-worktree")}
                      disabled={busy || !commitMessage.trim()}
                    >
                      <GitCommit className="mr-1.5 h-3.5 w-3.5" /> Commit
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {isReviewPhase(phase) && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <label
                    htmlFor="agent-review-comment"
                    className="text-sm font-semibold flex items-center gap-1.5"
                  >
                    <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {phase === "plan-review"
                        ? "Plan review feedback"
                        : "Need adjustments? Request changes"}
                    </span>
                  </label>
                  <Textarea
                    id="agent-review-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder={
                      phase === "plan-review"
                        ? "Describe what OMP should adjust in the plan..."
                        : "Describe what OMP should adjust in the code..."
                    }
                    rows={2}
                    disabled={busy}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => void runAction(commentAction)}
                      disabled={busy || !comment.trim()}
                      className="w-full sm:w-auto"
                    >
                      <MessageSquareQuote className="mr-1.5 h-3.5 w-3.5" /> Request changes
                    </Button>
                  </div>
                </div>
              )}

              {snapshot && snapshot.reviewComments.length > 0 && (
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <h4 className="flex items-center justify-between text-sm font-medium">
                    <span>Review history</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {snapshot.reviewComments.length}
                    </span>
                  </h4>
                  <ul
                    aria-label="Review history"
                    className="max-h-64 space-y-2 overflow-y-auto pr-1"
                  >
                    {snapshot.reviewComments.map((review) => (
                      <li
                        key={review.id}
                        className="rounded-md border border-border/50 bg-background/60 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant="outline">
                            {review.stage === "plan"
                              ? "Plan review"
                              : "Implementation review"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
                          {review.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          </div>
        </>
      )}
    </section>
  );
}
