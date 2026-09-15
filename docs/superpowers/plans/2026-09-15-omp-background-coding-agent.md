# Oh My Pi (OMP) Background Coding Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Oh My Pi (`omp`) as the primary background coding agent for Know-Me tasks via ACP over stdio, replacing the existing Codex runner while preserving review gates (investigation, plan review, implementation, code review), adding dedicated per-project workspace directory resolution, and supporting isolated Git worktrees.

**Architecture:** Replace `internal/agents/codex` with `internal/agents/omp`. Implement a standard-library ACP JSON-RPC client over stdio that handles dynamic authentication (`authMethods`), per-phase mode negotiation (`plan` vs `default`), inbound permission responses, and streaming chunk translation into bounded run logs and SSE progress events. Add per-project `workspacePath` resolution with canonical execution-root run locking, unified diff capture, and dual-read backward compatibility for existing tasks and chat sessions.

**Tech Stack:** Go 1.24 standard library, existing Chi router and JSON storage, Git CLI commands, React 19 / TypeScript, existing SSE broker.

**Spec:** `docs/superpowers/specs/2026-09-15-omp-background-coding-agent-design.md`

## Global Constraints

- Canonical status endpoint is `GET /api/omp/status` with `GET /api/codex/status` as backward-compatible alias. Do not modify `/api/agent/status` (reserved for OpenCode).
- Preserve CLI scaffolding for Codex MCP configuration (`.codex/config.toml` in `internal/cli`); cutover applies strictly to the background task agent runner subsystem.
- Implement dual-read compatibility: accept both `agentType: "codex"` and `agentType: "omp"` across task workflows and chat sessions on disk; write `agentType: "omp"` for new entries.
- Use atomic monotonic request IDs for ACP JSON-RPC requests with per-step timeouts (10s initialize, 10s authenticate, 15s session/new).
- Key workspace run locks by canonical evaluated directory path (`filepath.EvalSymlinks(absPath)`), not by `projectID`.
- Every project has its own separate workspace directory. Resolve `workspacePath` in order: explicit project setting (with tilde expansion and relative path resolution) > store repository root > global registry path > error. Fail closed on corrupt configuration.
- Enforce clean git status check before starting implementation directly in the project workspace (non-worktree).
- When a task uses an isolated worktree, bind ACP session `cwd` to `workflow.WorktreePath` and seed with the approved plan.
- Keep raw ACP logs redacted and capped to 4 MiB with truncation markers.
- Add no external Go dependencies; use Go standard library and existing project packages.

---

## File map

- Modify `internal/models/config.go`: add `WorkspacePath` to `ProjectSettings`.
- Modify `internal/models/config_test.go`: test `WorkspacePath` JSON serialization and validation.
- Create `internal/storage/workspace_resolver.go`: implement `ResolveProjectWorkspace` and `ExecutionRoot`.
- Create `internal/storage/workspace_resolver_test.go`: test resolution hierarchy, tilde expansion, relative paths, and fail-closed behavior.
- Modify `internal/storage/agent_store.go`: add canonical execution-root run locking (`AcquireWorkspaceRunLock`).
- Modify `internal/storage/agent_store_test.go`: test workspace-keyed lock conflict detection.
- Create `internal/agents/omp/runner.go`: OMP binary detection, `omp --version` parsing, dirty-file check, and diff generation.
- Create `internal/agents/omp/runner_test.go`: tests for detection, version parsing, and diff extraction.
- Create `internal/agents/omp/acp.go`: newline-delimited JSON-RPC client, dynamic auth handshake, mode setting, concurrent inbound request loop, cancellation.
- Create `internal/agents/omp/acp_test.go`: mock ACP subprocess tests for handshake, dynamic auth, mode transitions, timeouts, and streaming updates.
- Create `internal/agents/omp/worktree.go`: worktree creation, branch naming, ID sanitization (`worktreeSegment`).
- Create `internal/agents/omp/worktree_test.go`: worktree isolation and hostile ID sanitization tests.
- Create `internal/agents/omp/workflow.go`: OMP task workflow state machine (Investigation, Plan Review, Implementation, Code Review, Fix), clean workspace guard, resume, and cancel.
- Create `internal/agents/omp/workflow_test.go`: full lifecycle tests, review gates, clean workspace rejection, and cancelation.
- Create `internal/agents/omp/chat.go`: task-bound streaming chat with `agentType: "omp"`.
- Create `internal/agents/omp/chat_test.go`: task chat streaming and queue tests.
- Modify `internal/models/agent.go`: add `OMPSessionID` alongside `CodexSessionID`, dual-read compatibility, and diff fields.
- Modify `internal/server/routes/agent.go`: expose `GET /api/omp/status`, alias `GET /api/codex/status`, and `GET /api/tasks/:id/agent/diff`.
- Modify `internal/server/routes/agent_test.go`: tests for OMP status, aliases, and diff endpoint.
- Modify `internal/server/routes/chat.go`: support `agentType: "omp"` with `"codex"` fallback.
- Modify `internal/server/routes/chat_test.go`: tests for OMP chat sessions and send aliases.
- Modify `internal/server/routes/config.go`: accept `workspacePath` in project settings update.
- Modify `internal/server/routes/config_test.go`: test `workspacePath` config update API.
- Modify `internal/server/server.go`: mount `omp.Manager` instead of `codex.Manager`.
- Modify `ui/src/api/client.ts`: add `ompAgentApi` with `status()`, `snapshot()`, `action()`, and `diff()`.
- Modify `ui/src/models/agent.ts`: update status interface for OMP fields while preserving compatibility.
- Modify `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`: update labels to "Agent" / "OMP", render review gates, embed diff viewer.
- Modify `ui/src/pages/ConfigPage.tsx`: add Project Workspace Directory input field and validation indicator.

---

### Task 1: Per-Project Workspace Path Model and Settings API

**Files:**
- Modify: `internal/models/config.go:75-120`
- Modify: `internal/models/config_test.go`
- Modify: `internal/server/routes/config.go`
- Modify: `internal/server/routes/config_test.go`

**Interfaces:**
- Produces: `models.ProjectSettings.WorkspacePath string`
- Produces: `applySettingsUpdate` support for `workspacePath`
- Consumes: existing `ProjectSettings` and `ConfigRoutes`

- [ ] **Step 1: Write failing test for ProjectSettings.WorkspacePath**

Add test in `internal/models/config_test.go`:
```go
func TestProjectSettingsWorkspacePathJSON(t *testing.T) {
	settings := ProjectSettings{
		WorkspacePath: "/Users/alice/projects/demo",
	}
	data, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var decoded ProjectSettings
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if decoded.WorkspacePath != "/Users/alice/projects/demo" {
		t.Fatalf("got WorkspacePath %q, want %q", decoded.WorkspacePath, "/Users/alice/projects/demo")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/models -run TestProjectSettingsWorkspacePathJSON -v`
Expected: FAIL (unknown field or compilation failure)

- [ ] **Step 3: Implement WorkspacePath in ProjectSettings**

In `internal/models/config.go`:
```go
type ProjectSettings struct {
	// ... existing fields ...
	WorkspacePath string `json:"workspacePath,omitempty"`
}
```
Update `applySettingsUpdate` in `internal/server/routes/config.go` to handle `workspacePath`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/models -run TestProjectSettingsWorkspacePathJSON -v`
Expected: PASS

- [ ] **Step 5: Write test and implement config route update for workspacePath**

In `internal/server/routes/config_test.go`:
Test `PATCH /api/config` updating `workspacePath`.
Run: `go test ./internal/server/routes -run TestConfigRoutesWorkspacePath -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/models/config.go internal/models/config_test.go internal/server/routes/config.go internal/server/routes/config_test.go
git commit -m "feat(config): add workspacePath to project settings model and API"
```

---

### Task 2: Workspace Path Resolution & Canonical Execution Root Locking

**Files:**
- Create: `internal/storage/workspace_resolver.go`
- Create: `internal/storage/workspace_resolver_test.go`
- Modify: `internal/storage/agent_store.go`
- Modify: `internal/storage/agent_store_test.go`

**Interfaces:**
- Produces: `storage.ResolveProjectWorkspace(store *Store, reg *registry.Registry) (string, error)`
- Produces: `storage.ExecutionRoot(store *Store, reg *registry.Registry, workflow *models.AgentWorkflow) (string, error)`
- Produces: `store.Agent.AcquireWorkspaceRunLock(ctx context.Context, executionRoot string) (*AgentRunLock, error)`
- Consumes: `store.Config`, `store.RepositoryRoot()`, `registry.Registry.Get()`

- [ ] **Step 1: Write failing tests for workspace path resolution and canonical locking**

In `internal/storage/workspace_resolver_test.go`:
Test:
1. Explicit `settings.workspacePath` takes priority.
2. Tilde `~/foo` is expanded to user home dir.
3. Relative path is resolved against `store.RepositoryRoot()`.
4. Non-existent path returns error.
5. Corrupt `config.json` fails closed with error.
6. Fallback to `store.RepositoryRoot()`.
7. Fallback to `reg.Get(projectID).Path`.

In `internal/storage/agent_store_test.go`:
Test `AcquireWorkspaceRunLock` blocks two runs sharing the same canonical directory path even with different `projectID`s.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/storage -run TestResolveProjectWorkspace -v`
Expected: FAIL

- [ ] **Step 3: Implement workspace_resolver.go and AcquireWorkspaceRunLock**

In `internal/storage/workspace_resolver.go`:
```go
package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/registry"
)

func ResolveProjectWorkspace(store *Store, reg *registry.Registry) (string, error) {
	if store == nil {
		return "", errors.New("store is required")
	}

	if store.Config != nil {
		cfg, err := store.Config.Load()
		if err != nil && !os.IsNotExist(err) {
			return "", fmt.Errorf("read project configuration: %w", err)
		}
		if err == nil && strings.TrimSpace(cfg.Settings.WorkspacePath) != "" {
			rawPath := strings.TrimSpace(cfg.Settings.WorkspacePath)
			if strings.HasPrefix(rawPath, "~/") || rawPath == "~" {
				if home, err := os.UserHomeDir(); err == nil {
					rawPath = filepath.Join(home, strings.TrimPrefix(rawPath, "~/"))
				}
			}
			if !filepath.IsAbs(rawPath) && store.RepositoryRoot() != "" {
				rawPath = filepath.Join(store.RepositoryRoot(), rawPath)
			}
			cleaned := filepath.Clean(rawPath)
			canonical, err := filepath.EvalSymlinks(cleaned)
			if err != nil {
				canonical = cleaned
			}
			info, err := os.Stat(canonical)
			if err != nil {
				return "", fmt.Errorf("configured workspacePath does not exist: %s", cleaned)
			}
			if !info.IsDir() {
				return "", fmt.Errorf("configured workspacePath is not a directory: %s", cleaned)
			}
			return canonical, nil
		}
	}

	if root := store.RepositoryRoot(); root != "" {
		if canonical, err := filepath.EvalSymlinks(root); err == nil {
			if info, err := os.Stat(canonical); err == nil && info.IsDir() {
				return canonical, nil
			}
		}
	}

	if reg != nil && store.ProjectID != "" {
		if proj, err := reg.Get(store.ProjectID); err == nil && strings.TrimSpace(proj.Path) != "" {
			cleaned := filepath.Clean(proj.Path)
			if canonical, err := filepath.EvalSymlinks(cleaned); err == nil {
				if info, err := os.Stat(canonical); err == nil && info.IsDir() {
					return canonical, nil
				}
			}
		}
	}

	return "", errors.New("no valid local project workspace directory found; configure workspacePath in project settings")
}

func ExecutionRoot(store *Store, reg *registry.Registry, workflow *models.AgentWorkflow) (string, error) {
	if workflow != nil && workflow.WorktreePath != "" {
		info, err := os.Stat(workflow.WorktreePath)
		if err != nil || !info.IsDir() {
			return "", fmt.Errorf("task worktree is unavailable: %s", workflow.WorktreePath)
		}
		return filepath.EvalSymlinks(workflow.WorktreePath)
	}
	return ResolveProjectWorkspace(store, reg)
}
```

Implement `AcquireWorkspaceRunLock` in `internal/storage/agent_store.go` hashing canonical execution path to a global lock file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/storage -run "TestResolveProjectWorkspace|TestWorkspaceRunLock" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/storage/workspace_resolver.go internal/storage/workspace_resolver_test.go internal/storage/agent_store.go internal/storage/agent_store_test.go
git commit -m "feat(storage): implement project workspace resolution and canonical run locking"
```

---

### Task 3: OMP ACP Process, Protocol Handshake & Transport (`internal/agents/omp`)

**Files:**
- Create: `internal/agents/omp/runner.go`
- Create: `internal/agents/omp/runner_test.go`
- Create: `internal/agents/omp/acp.go`
- Create: `internal/agents/omp/acp_test.go`

**Interfaces:**
- Produces: `omp.Detect(ctx context.Context, executable string) Status`
- Produces: `omp.NewACPProcess(ctx context.Context, root string, command []string, logger *runLogger) (*ACPProcess, error)`
- Produces: `ACPProcess.NewSession(ctx context.Context) error`
- Produces: `ACPProcess.SetMode(ctx context.Context, mode ACPMode) error`
- Produces: `ACPProcess.Prompt(ctx context.Context, prompt string, callback func(ACPUpdate)) (string, error)`
- Produces: `ACPProcess.Cancel(ctx context.Context) error`
- Produces: `ACPProcess.Close(ctx context.Context) error`

- [ ] **Step 1: Write failing tests for OMP detection and ACP handshake**

In `internal/agents/omp/runner_test.go`:
- Test detection returns `Installed: true`, version parsing, and proper install/login command defaults (`brew install can1357/tap/omp`, `omp auth-broker`).

In `internal/agents/omp/acp_test.go`:
- Test ACP handshake with mock stdio process:
  1. Validates `initialize` returns `authMethods: [{"id": "agent"}]`.
  2. Sends `authenticate` with `methodId: "agent"`.
  3. Validates `session/new` captures `sessionId`.
  4. Tests `session/set_mode` (`plan` vs `default`).
  5. Tests prompt streaming of `agent_message_chunk` updates.
  6. Tests cancellation with timeout.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/agents/omp -v`
Expected: FAIL (package does not exist yet)

- [ ] **Step 3: Implement runner.go and acp.go in internal/agents/omp**

Implement:
- `runner.go`: command resolution (`KNOWME_OMP_PATH` > `exec.LookPath("omp")`), `omp --version` parser, git status, git diff generator.
- `acp.go`: newline-delimited JSON-RPC client with atomic request IDs, dynamic auth check on `initialize` response, mode setting, concurrent inbound loop answering permission requests, and bounded run logger.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/agents/omp -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agents/omp/runner.go internal/agents/omp/runner_test.go internal/agents/omp/acp.go internal/agents/omp/acp_test.go
git commit -m "feat(agents/omp): implement OMP detection and ACP stdio client with dynamic auth"
```

---

### Task 4: Worktree Isolation & Session Re-binding

**Files:**
- Create: `internal/agents/omp/worktree.go`
- Create: `internal/agents/omp/worktree_test.go`

**Interfaces:**
- Produces: `omp.CreateTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (string, string, error)`
- Produces: `omp.WorktreePath(projectID, taskID string) string`
- Produces: `omp.WorktreeBranch(projectID, taskID string) string`
- Consumes: Git CLI, `storage.GlobalRootPath()`

- [ ] **Step 1: Write failing tests for worktree creation and ID sanitization**

In `internal/agents/omp/worktree_test.go`:
- Test worktree creation in Git repo.
- Test branch naming `knowme/<project-id>/<task-id>`.
- Test ID sanitization (`../../evil-id` -> sanitized filesystem-safe path).
- Test duplicate worktree prevention.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/agents/omp -run TestCreateTaskWorktree -v`
Expected: FAIL

- [ ] **Step 3: Implement worktree.go**

Port and adapt worktree management to OMP with sanitized branch prefixes (`knowme/`):
```go
package omp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/hoangtrung1801/know-me/internal/util"
)

func CreateTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (string, string, error) {
	if repositoryRoot == "" || projectID == "" || taskID == "" {
		return "", "", errors.New("repository root, project ID, and task ID are required")
	}
	path := taskWorktreePath(projectID, taskID)
	if _, err := os.Stat(path); err == nil {
		return "", "", fmt.Errorf("task worktree already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", "", fmt.Errorf("stat task worktree: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", "", fmt.Errorf("create worktree parent directory: %w", err)
	}
	branch := taskWorktreeBranch(projectID, taskID)
	cmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "add", "-b", branch, path, "HEAD")
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("git worktree add: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return path, branch, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/agents/omp -run TestCreateTaskWorktree -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agents/omp/worktree.go internal/agents/omp/worktree_test.go
git commit -m "feat(agents/omp): implement worktree isolation and branch management"
```

---

### Task 5: Workflow State Machine, Diff Extraction & Dual-Read Storage

**Files:**
- Create: `internal/agents/omp/workflow.go`
- Create: `internal/agents/omp/workflow_test.go`
- Create: `internal/agents/omp/chat.go`
- Create: `internal/agents/omp/chat_test.go`
- Modify: `internal/models/agent.go`
- Modify: `internal/models/chat.go`

**Interfaces:**
- Produces: `omp.NewManager(executable string, emit func(Event), chatEmit ...func(ChatEvent)) *Manager`
- Produces: `Manager.Act(ctx context.Context, store *storage.Store, taskID string, action Action, comment string) (models.AgentTaskSnapshot, bool, error)`
- Produces: `Manager.Diff(ctx context.Context, store *storage.Store, taskID string) (string, error)`
- Produces: `Manager.StartChat(ctx context.Context, store *storage.Store, taskID, content string) error`
- Consumes: `ACPProcess`, `storage.ExecutionRoot`, `storage.AgentStore`

- [ ] **Step 1: Write failing tests for workflow gates, clean workspace check, and diff**

In `internal/agents/omp/workflow_test.go`:
- Test `start-investigation` prompts in `plan` mode.
- Test `approve-plan` fails if workspace is dirty (non-worktree) and succeeds if clean.
- Test `create-worktree` isolates implementation run.
- Test diff generation returns unified git diff for code-review phase.
- Test `approve-implementation` advances task status.
- Test cancellation releases active run and preserves interrupted state.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/agents/omp -run TestWorkflow -v`
Expected: FAIL

- [ ] **Step 3: Implement workflow.go and chat.go**

In `internal/agents/omp/workflow.go`:
- Implement review gates: Investigation -> Plan Review -> Implementation -> Code Review.
- Enforce clean workspace check before implementation in root workspace.
- Implement diff capture using `git diff HEAD` (capped at 250 KB).
- Implement task chat integration with `agentType: "omp"`.
In `internal/models/agent.go` and `internal/models/chat.go`:
- Add dual-read alias: map `CodexSessionID` and `OMPSessionID` so old sessions load seamlessly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/agents/omp -run "TestWorkflow|TestChat" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agents/omp/workflow.go internal/agents/omp/workflow_test.go internal/agents/omp/chat.go internal/agents/omp/chat_test.go internal/models/agent.go internal/models/chat.go
git commit -m "feat(agents/omp): implement workflow state machine, diff generation, and chat coordinator"
```

---

### Task 6: HTTP Routes, Dual Endpoints & Server Wiring

**Files:**
- Modify: `internal/server/routes/agent.go`
- Modify: `internal/server/routes/agent_test.go`
- Modify: `internal/server/routes/chat.go`
- Modify: `internal/server/routes/chat_test.go`
- Modify: `internal/server/routes/router.go`
- Modify: `internal/server/server.go`

**Interfaces:**
- Produces: `GET /api/omp/status` (canonical)
- Produces: `GET /api/codex/status` (compatibility alias)
- Produces: `GET /api/tasks/:id/agent/diff`
- Produces: `POST /api/chats/:id/send` with `/messages` alias
- Consumes: `omp.Manager`

- [ ] **Step 1: Write failing router tests for OMP endpoints**

In `internal/server/routes/agent_test.go`:
- Test `GET /api/omp/status` returns OMP status.
- Test `GET /api/codex/status` returns same status.
- Test `GET /api/tasks/:id/agent/diff` returns diff string.
- Test `/api/agent/status` remains untouched for OpenCode.

- [ ] **Step 2: Run router tests to verify they fail**

Run: `go test ./internal/server/routes -run TestAgentRoutes -v`
Expected: FAIL

- [ ] **Step 3: Wire OMP manager in server.go and routes/agent.go**

- In `internal/server/server.go`: replace `codexManager` with `ompManager *omp.Manager`.
- In `internal/server/routes/agent.go`: bind `/omp/status`, `/codex/status`, and `/tasks/{id}/agent/diff`.
- In `internal/server/routes/chat.go`: support `agentType: "omp"` with `"codex"` backward compatibility.

- [ ] **Step 4: Run router tests to verify they pass**

Run: `go test ./internal/server/routes -run "TestAgentRoutes|TestChatRoutes" -v`
Expected: PASS

- [ ] **Step 5: Run full server test suite**

Run: `go test ./internal/server/... -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/server/server.go internal/server/routes/agent.go internal/server/routes/agent_test.go internal/server/routes/chat.go internal/server/routes/chat_test.go internal/server/routes/router.go
git commit -m "feat(server): wire OMP agent manager, status endpoints, and diff route"
```

---

### Task 7: Frontend UI Updates (TaskDetail, Project Settings, Config)

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/models/agent.ts`
- Modify: `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`
- Modify: `ui/src/components/organisms/TaskDetail/TaskCodexRail.tsx`
- Modify: `ui/src/pages/ConfigPage.tsx`

**Interfaces:**
- Produces: `ompAgentApi.status()`, `ompAgentApi.snapshot()`, `ompAgentApi.action()`, `ompAgentApi.diff()`
- Produces: Project Workspace Directory setting in `ConfigPage`
- Produces: Embedded DiffViewer in `TaskAgentPanel` during `code-review` phase
- Consumes: `/api/omp/status`, `/api/tasks/:id/agent/*`, `/api/config`

- [ ] **Step 1: Update API client and agent model**

In `ui/src/models/agent.ts`:
Add OMP status fields and diff response model.
In `ui/src/api/client.ts`:
Add `ompAgentApi` calling `/api/omp/status`, `/api/tasks/:id/agent/*`, and `/api/tasks/:id/agent/diff`.

- [ ] **Step 2: Update TaskAgentPanel and TaskCodexRail**

- Update tab label to "Agent" / "OMP".
- Fetch and display unified diff using `DiffViewer` during `code-review`.
- Show clear action buttons: Approve Plan, Request Changes, Create Worktree, Approve Implementation, Start Fix.

- [ ] **Step 3: Update ConfigPage with Workspace Path field**

Add input field for `workspacePath` under Project Settings:
- Path input with auto-detected fallback label.
- Save handler updating project configuration via `PATCH /api/config`.

- [ ] **Step 4: Typecheck and build frontend**

Run: `cd ui && npm run typecheck && npm run build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/api/client.ts ui/src/models/agent.ts ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx ui/src/components/organisms/TaskDetail/TaskCodexRail.tsx ui/src/pages/ConfigPage.tsx
git commit -m "feat(ui): update task agent rail, diff viewer, and project workspace settings for OMP"
```

---

### Task 8: End-to-End Verification & Legacy Clean-up

**Files:**
- Remove: `internal/agents/codex/` (clean cutover once OMP is fully active)
- Test: `tests/` and CLI validation

- [ ] **Step 1: Run comprehensive Go test suite**

Run: `go test ./internal/...`
Expected: ALL PASS

- [ ] **Step 2: Verify CLI and server startup**

Run: `go build -o /tmp/knowme ./cmd/knowme && /tmp/knowme --help`
Expected: PASS

- [ ] **Step 3: Commit final clean cutover**

```bash
git rm -r internal/agents/codex
git commit -m "refactor: complete clean cutover from codex agent to omp agent"
```
