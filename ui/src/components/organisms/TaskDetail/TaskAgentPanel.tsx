import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleStop,
  GitBranch,
  Loader2,
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
import { TaskCodexChat } from "./TaskCodexChat";

interface TaskAgentPanelProps {
  task: Task;
  onTaskUpdated?: (task: Task) => void;
  onCollapse?: () => void;
  embedded?: boolean;
}

function isReviewPhase(phase: AgentPhase): boolean {
  return phase === "plan-review" || phase === "code-review";
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
    async (nextAction: AgentAction) => {
      setAction(nextAction);
      setError(null);
      setProgress(null);
      try {
        setSnapshot(await codexAgentApi.action(task.id, nextAction, comment));
        void refreshTask();
        if (
          nextAction === "request-plan-changes" ||
          nextAction === "request-implementation-changes"
        ) {
          setComment("");
        }
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Codex action failed",
        );
      } finally {
        setAction(null);
      }
    },
    [comment, refreshTask, task.id],
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
    Boolean(snapshot?.dirtyFiles.length) &&
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
          <Loader2 className="animate-spin" /> Loading Codex workflow…
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
              <Button
                size="sm"
                onClick={() => void runAction("start-investigation")}
                disabled={busy || !codexReady || task.status !== "in-progress"}
              >
                <Play /> Start investigation
              </Button>
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
              <Button
                size="sm"
                onClick={() => void runAction("approve-implementation")}
                disabled={busy}
              >
                <Check /> Approve implementation
              </Button>
            )}
            {onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8"
                onClick={onCollapse}
                aria-label="Collapse Codex panel"
                title="Collapse Codex panel"
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
          <TaskCodexChat
            taskId={task.id}
            taskStatus={task.status}
            snapshot={snapshot}
            codexStatus={codexStatus}
            onRefresh={load}
          />

          <div className="shrink-0 space-y-4 px-4 pb-4">
            {codexStatus && !codexReady && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 shrink-0" />
                <span>
                  {codexStatus.installed
                    ? "Sign in to Codex before starting a run."
                    : "Install codex-acp before starting a run."}
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
                    Codex workflow error
                  </p>
                  <p className="mt-1 max-h-24 overflow-y-auto break-words whitespace-pre-wrap text-sm leading-5 text-destructive/80">
                    {error}
                  </p>
                </div>
              </div>
            )}
            {phase === "idle" && task.status !== "in-progress" && (
              <p className="text-sm text-muted-foreground">
                Move this task to in-progress to start Codex.
              </p>
            )}

            {(phase === "fix-ready" || canCreateWorktree) &&
              snapshot &&
              snapshot.dirtyFiles.length > 0 && (
                <div className="rounded-md border border-amber-200 p-3 text-sm dark:border-amber-900">
                  <p className="font-medium">Workspace changes to review</p>
                  <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                    {snapshot.dirtyFiles.map((file) => (
                      <li key={file}>{file}</li>
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
                </div>
              )}

            <div className="space-y-4 max-h-24 overflow-y-auto">
              {isReviewPhase(phase) && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <label
                    htmlFor="codex-review-comment"
                    className="text-sm font-semibold"
                  >
                    Review comment
                  </label>
                  <Textarea
                    id="codex-review-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Describe what Codex should change"
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
                      Request changes
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
                    className="max-h-64 space-y-2 pr-1"
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
        </>
      )}
    </section>
  );
}
