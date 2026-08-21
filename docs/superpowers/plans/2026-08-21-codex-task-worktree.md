# Codex Task Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dirty Codex task create one persistent isolated Git worktree, retry implementation there, and reuse it for later task runs.

**Architecture:** Persist `worktreePath` and `worktreeBranch` on `AgentWorkflow`. The Codex manager resolves an effective execution root from that workflow, while a new `create-worktree` action creates the task worktree and immediately starts the blocked implementation. The existing generic agent route and task panel are reused; no separate worktree API or page is added.

**Tech Stack:** Go, `os/exec` Git commands, existing JSON stores, React/TypeScript, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-21-codex-task-worktree-design.md`

## Global Constraints

- A task has at most one persisted worktree.
- The worktree is created from `HEAD`, so existing edits in the current folder are preserved and are not copied into the task worktree.
- The worktree uses a task-scoped branch and is stored outside the repository working tree under Know-Me's global runtime directory.
- The dirty-workspace action creates the worktree, reloads the saved ACP session in the new root, and retries the blocked implementation in one user action.
- The current project folder remains unchanged.
- Worktree deletion and branch cleanup are not part of this change.
- Use existing dependencies and the generic `/api/tasks/{id}/agent/{action}` route.

---

## File Map

- Create `internal/agents/codex/worktree.go`: deterministic task worktree path/branch generation and Git worktree creation.
- Create `internal/agents/codex/worktree_test.go`: real temporary Git repository coverage for worktree creation.
- Modify `internal/models/agent.go`: persist the optional task worktree path and branch.
- Modify `internal/agents/codex/workflow.go`: add the action, resolve effective roots, switch ACP sessions, and route all gated snapshots/runs through the task worktree.
- Modify `internal/agents/codex/chat.go`: use the task worktree for Auto chat and active-run lookup.
- Modify `internal/agents/codex/workflow_test.go` and `internal/agents/codex/chat_test.go`: verify creation, persistence, root switching, and reuse.
- Modify `ui/src/models/agent.ts`: expose worktree fields and the new action.
- Modify `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`: render the recovery warning and action.
- Modify `ui/e2e/codex-agent.spec.ts`: cover the dirty-workspace button and retry result.

### Task 1: Add the minimal Git worktree primitive

**Files:**
- Create: `internal/agents/codex/worktree.go`
- Create: `internal/agents/codex/worktree_test.go`

**Interfaces:**
- Produces `createTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (path, branch string, err error)` for the manager.
- Produces `taskWorktreePath(projectID, taskID string) string` and `taskWorktreeBranch(projectID, taskID string) string` as deterministic internal helpers.

- [ ] **Step 1: Write the failing Git worktree test**

Create a temporary repository, configure a local test identity, commit one file, set `HOME` to a temporary directory, call `createTaskWorktree`, and assert that:

```go
path, branch, err := createTaskWorktree(context.Background(), repo, "project-1", "task-1")
if err != nil { t.Fatal(err) }
if branch != taskWorktreeBranch("project-1", "task-1") { t.Fatalf("branch = %q", branch) }
if _, err := os.Stat(filepath.Join(path, ".git")); err != nil { t.Fatalf("worktree missing: %v", err) }
```

Also assert the checked-out worktree contains the committed file and that a second call for the same task is rejected rather than creating a second worktree.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
go test ./internal/agents/codex -run 'TestCreateTaskWorktree' -count=1
```

Expected: FAIL because the worktree helpers do not exist.

- [ ] **Step 3: Implement the smallest Git helper**

Use `os.MkdirAll` for the generated parent directory and `exec.CommandContext` with argument arrays:

```text
git -C <repositoryRoot> worktree add -b <branch> <path> HEAD
```

Put paths under `storage.GlobalRootPath()/worktrees/<projectID>/<taskID>`. Sanitize each generated path segment to alphanumeric, dot, underscore, or hyphen. Return stderr in errors. Reject empty roots/IDs and an existing destination. Do not invoke a shell and do not copy dirty files.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
go test ./internal/agents/codex -run 'TestCreateTaskWorktree' -count=1
```

Expected: PASS.

### Task 2: Persist one worktree and make the manager use it

**Files:**
- Modify: `internal/models/agent.go`
- Modify: `internal/agents/codex/workflow.go`
- Modify: `internal/agents/codex/workflow_test.go`
- Modify: `internal/agents/codex/chat.go`
- Modify: `internal/agents/codex/chat_test.go`

**Interfaces:**
- Consumes `createTaskWorktree` from Task 1.
- Produces `ActionCreateWorktree = "create-worktree"`.
- Persists `AgentWorkflow.WorktreePath` and `AgentWorkflow.WorktreeBranch`.
- Uses `executionRoot(store, workflow) (string, error)` for ACP startup, dirty-file snapshots, cancellation, gated runs, Auto chat, and resume.

- [ ] **Step 1: Write failing workflow tests**

Add tests that seed a `plan-review` task with dirty files and verify:

```go
snapshot, started, err := manager.Act(ctx, store, "task01", ActionCreateWorktree, "")
if err != nil || !started { t.Fatalf("snapshot=%#v started=%v err=%v", snapshot, started, err) }
state, _ := store.Agent.Load()
workflow := findWorkflow(&state, store.ProjectID, "task01")
if workflow.WorktreePath == "" || workflow.WorktreeBranch == "" { t.Fatal("worktree was not persisted") }
```

Wait for `code-review`, assert the fake runner/session received the persisted worktree path, and assert a second `ActionCreateWorktree` returns `ErrConflict` without changing the path. Add a snapshot test proving dirty files are read from the persisted worktree root after creation. Add a chat test proving `StartChat` passes the same root.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
go test ./internal/agents/codex -run 'TestManagerCreatesTaskWorktree|TestManagerUsesTaskWorktree|TestChatUsesTaskWorktree' -count=1
```

Expected: FAIL because the workflow fields/action/root resolution do not exist.

- [ ] **Step 3: Add persisted workflow fields and root resolution**

Add optional JSON fields to `AgentWorkflow`. Add an `executionRoot` helper that returns the persisted worktree after verifying it is still a directory, otherwise returns the normal repository root. Replace direct `store.RepositoryRoot()` calls in the Codex manager where the agent process, dirty-file check, active-run lookup, cancellation, or chat root is selected.

- [ ] **Step 4: Add the create-and-retry action**

In `Manager.Act`, accept `ActionCreateWorktree` only when the task is `in-progress`, the phase is `plan-review`, no run is active, and no worktree is persisted. Create the worktree, save its path/branch, remove and close the in-memory ACP session so the next process is rooted correctly, then call the existing implementation start path. Keep the persisted worktree if ACP startup fails so the user can retry; do not advance task status until the normal implementation run succeeds.

- [ ] **Step 5: Make session reload use the new root**

Pass the effective root into `ensureSession` and `executeSession`/`executeChatSession`. Preserve the saved `CodexSessionID` so a new ACP process calls `session/load` after the root switch. Keep the existing project run lock and action transitions unchanged.

- [ ] **Step 6: Run the focused backend tests and confirm they pass**

Run:

```bash
go test ./internal/agents/codex -run 'TestManagerCreatesTaskWorktree|TestManagerUsesTaskWorktree|TestChatUsesTaskWorktree|TestManagerRunsInvestigationImplementationAndReviewLoop|TestManagerRequiresCleanInitialImplementationButAllowsDirtyFix' -count=1
```

Expected: PASS.

### Task 3: Add the task-panel recovery action

**Files:**
- Modify: `ui/src/models/agent.ts`
- Modify: `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`
- Modify: `ui/e2e/codex-agent.spec.ts`

**Interfaces:**
- Consumes `workflow.worktreePath`, `snapshot.dirtyFiles`, and the generic agent action API.
- Produces the accessible button `Create isolated worktree & retry`.

- [ ] **Step 1: Write the failing browser test**

Add a mocked task flow whose initial snapshot is `plan-review` with `dirtyFiles: ["README.md"]`, no `worktreePath`, and Codex ready. Assert the warning and button are visible. On `create-worktree`, return an `implementing` snapshot with a persisted `worktreePath`; assert the button disappears and implementation progress is shown. Assert the action request uses `create-worktree`.

- [ ] **Step 2: Run the focused browser test and confirm it fails**

Run:

```bash
cd ui && bunx playwright test e2e/codex-agent.spec.ts -g 'isolated worktree'
```

Expected: FAIL because the action/type/UI do not exist.

- [ ] **Step 3: Implement the smallest UI change**

Add `create-worktree` to `AgentAction` and render the existing dirty-file warning for `plan-review` when the snapshot has dirty files and no persisted worktree. Add one primary button that calls `runAction("create-worktree")`, disables during an action or unavailable Codex, and retains the existing error/progress handling. Do not parse the backend error string.

- [ ] **Step 4: Run the focused browser test and confirm it passes**

Run:

```bash
cd ui && bunx playwright test e2e/codex-agent.spec.ts -g 'isolated worktree'
```

Expected: PASS.

### Task 4: Verify the integrated behavior

**Files:**
- Modify only files required by failing checks; no additional abstractions or management UI.

- [ ] **Step 1: Run formatting and focused backend tests**

```bash
gofmt -w internal/models/agent.go internal/agents/codex/worktree.go internal/agents/codex/worktree_test.go internal/agents/codex/workflow.go internal/agents/codex/workflow_test.go internal/agents/codex/chat.go internal/agents/codex/chat_test.go
go test ./internal/agents/codex ./internal/server/routes
```

- [ ] **Step 2: Run the focused UI checks**

```bash
cd ui && bunx playwright test e2e/codex-agent.spec.ts
```

- [ ] **Step 3: Run repository validation**

```bash
go test ./...
cd ui && bun run build
cd .. && git diff --check
```

- [ ] **Step 4: Review the diff for scope**

Confirm there is one worktree per task, no current-folder reset/stash/delete, no new dependency, no worktree deletion/merge behavior, and no unrelated file churn.
