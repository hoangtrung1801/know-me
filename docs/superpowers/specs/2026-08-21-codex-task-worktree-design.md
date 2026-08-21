# Codex Task Worktree Design

## Goal

When Codex cannot start implementation because the current repository has
uncommitted changes, let the user create one isolated Git worktree for that
task and retry the implementation there. Later fixes, task chat, and resumed
runs use the same task worktree.

## Decisions

- A task has at most one persisted worktree.
- The worktree is created from `HEAD`, so existing edits in the current folder
  are preserved and are not copied into the task worktree.
- The worktree uses a task-scoped branch and is stored outside the repository
  working tree under Know-Me's global runtime directory.
- The dirty-workspace action creates the worktree, reloads the saved ACP
  session in the new root, and retries the blocked implementation in one user
  action.
- The current project folder remains unchanged.
- Worktree deletion and branch cleanup are not part of this change.

## Data model

Extend `AgentWorkflow` with optional `worktreePath` and `worktreeBranch`
fields. An empty path means Codex uses the project's current repository root.
The persisted path is the source of truth for all later task-scoped Codex
operations.

## Backend flow

1. The existing `approve-plan` action still rejects a dirty current repository
   and returns the existing conflict error.
2. The agent snapshot exposes the dirty-file list, so the task panel can show
   the recovery action without parsing an error string.
3. A new `create-worktree` action is valid only for an in-progress task in
   `plan-review` with no active run and no existing task worktree.
4. The manager runs Git with argument arrays: create the generated parent
   directory, run `git worktree add -b <task branch> <path> HEAD`, persist the
   path/branch, close the in-memory ACP process, and start implementation.
5. ACP loads the saved task session in a process rooted at the new worktree.
   If there is no saved session, it creates one there.
6. If persistence or startup fails, the new worktree remains available for a
   later retry and the task returns to `plan-review`; no task status advances.
7. Dirty-file snapshots, cancellation, active-run lookup, chat, fixes, and
   resume resolve the task's persisted worktree root when present.

The existing project run lock remains the concurrency boundary. A worktree is
task-scoped for file isolation, but the current version still permits only one
active Codex run per project.

## UI flow

On a `plan-review` task with dirty files and no task worktree, show an amber
warning listing the files and a primary button labeled `Create isolated
worktree & retry`. The button is disabled while an action is running or Codex
is unavailable. On success it enters the normal implementation progress state;
on failure it keeps the warning and shows the returned error.

Once a task has a worktree, the panel does not offer a second creation action.
The existing implementation, fix, chat, and resume controls remain unchanged.

## Verification

- Unit-test Git worktree creation and generated task branch/path behavior.
- Test that the new action persists one worktree and starts implementation.
- Test that subsequent task runs use the persisted worktree root and that the
  original repository root is no longer used for dirty-file checks.
- Test idempotent rejection of a second worktree creation action.
- Add a browser test for the dirty warning and recovery button.
- Run focused Go/UI checks, repository validation, and `git diff --check`.

## Scope

Included: one task worktree, persisted root/branch, ACP root switching,
recovery action, dirty-file UI, and focused tests.

Not included: worktree deletion, branch merging, automatic commits, changing
the project-wide one-run lock, or a general worktree management page.
