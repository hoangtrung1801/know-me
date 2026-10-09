import { CheckCircle2, Circle, Clock, CheckSquare, FileText, Bookmark, Play } from "lucide-react";
import type { DemoState } from "../../lib/demoTypes";

export interface SampleWorkspaceProps {
  state: DemoState;
  onRun: (command: string) => void;
}

export function SampleWorkspace({ state, onRun }: SampleWorkspaceProps) {
  const isTaskInProgress = state.task.status === "in-progress";
  const firstCriterionChecked = state.task.criteria[0]?.completed ?? false;

  const handleToggleTaskStatus = () => {
    if (isTaskInProgress) {
      onRun(`knowme task edit ${state.task.id} -s todo`);
    } else {
      onRun(`knowme task edit ${state.task.id} -s in-progress`);
    }
  };

  const handleToggleFirstCriterion = () => {
    if (firstCriterionChecked) {
      onRun(`knowme task edit ${state.task.id} --uncheck-ac 1`);
    } else {
      onRun(`knowme task edit ${state.task.id} --check-ac 1`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--landing-surface)] text-[var(--landing-text)] rounded-2xl border border-[var(--landing-border)] shadow-xl overflow-hidden text-xs sm:text-sm">
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--landing-surface-muted)] border-b border-[var(--landing-border)] select-none">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--landing-primary)] animate-pulse" />
          <span className="font-semibold text-xs text-[var(--landing-text)]">
            Human Workspace · {state.projectName}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[var(--landing-muted)]">
          .know-me/tasks/
        </span>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 p-5 space-y-6 overflow-y-auto max-h-[380px] scrollbar-thin">
        {/* Task Card */}
        <div className="p-4 rounded-xl border border-[var(--landing-border)] bg-white shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold text-[var(--landing-primary)] px-2 py-0.5 rounded bg-[var(--landing-primary-soft)]">
              {state.task.id}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                  isTaskInProgress
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                {state.task.status === "in-progress" ? "In Progress" : "To Do"}
              </span>

              <button
                type="button"
                onClick={handleToggleTaskStatus}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--landing-surface-muted)] hover:bg-[var(--landing-border)] text-[var(--landing-text)] transition-colors cursor-pointer"
              >
                {isTaskInProgress ? "Move to Todo" : "Start Task"}
              </button>
            </div>
          </div>

          <h4 className="font-bold text-sm text-[var(--landing-text)]">
            {state.task.title}
          </h4>

          {/* Acceptance Criteria */}
          <div className="space-y-2 pt-1 border-t border-[var(--landing-border)]">
            <div className="flex items-center justify-between text-[11px] text-[var(--landing-muted)] font-medium">
              <span>Acceptance Criteria</span>
              <span>
                {state.task.criteria.filter((c) => c.completed).length} /{" "}
                {state.task.criteria.length} done
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Criterion 1 - Interactive */}
              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[var(--landing-surface-muted)] hover:bg-slate-100/80 transition-colors cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={firstCriterionChecked}
                  onChange={handleToggleFirstCriterion}
                  className="rounded text-[var(--landing-primary)] focus:ring-[var(--landing-primary)] cursor-pointer"
                />
                <span
                  className={`text-xs ${
                    firstCriterionChecked
                      ? "line-through text-[var(--landing-muted)]"
                      : "text-[var(--landing-text)]"
                  }`}
                >
                  {state.task.criteria[0]?.text}
                </span>
                <span className="ml-auto text-[10px] font-mono text-[var(--landing-primary)]">
                  --check-ac 1
                </span>
              </label>

              {/* Criterion 2 - Static Sample */}
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[var(--landing-surface-muted)] opacity-70">
                <input
                  type="checkbox"
                  checked={state.task.criteria[1]?.completed ?? false}
                  disabled
                  className="rounded text-slate-400"
                />
                <span className="text-xs text-[var(--landing-muted)]">
                  {state.task.criteria[1]?.text}
                </span>
                <span className="ml-auto text-[10px] font-mono text-[var(--landing-muted)]">
                  --check-ac 2
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Memos Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--landing-text)]">
            <div className="flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-[var(--landing-primary)]" />
              <span>Global Memos (~/.know-me/)</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--landing-muted)]">
              {state.memos.length} captured
            </span>
          </div>

          {state.memos.length === 0 ? (
            <div className="p-3 text-center rounded-lg border border-dashed border-[var(--landing-border)] text-xs text-[var(--landing-muted)]">
              No global memos captured yet. Try the Capture workflow.
            </div>
          ) : (
            <div className="space-y-1.5">
              {state.memos.map((memo) => (
                <div
                  key={memo.id}
                  className="p-2.5 rounded-lg bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] flex items-start justify-between gap-2 text-xs"
                >
                  <span className="text-[var(--landing-text)]">{memo.content}</span>
                  <span className="font-mono text-[10px] text-[var(--landing-muted)] whitespace-nowrap">
                    {memo.id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
