# Oh My Pi (OMP) Background Coding Agent Design

## Goal

Integrate Oh My Pi (`omp`) as the primary background coding agent for Know-Me tasks via the Agent Client Protocol (ACP) over standard input/output. A user can assign a task to OMP, have OMP investigate the task and codebase in read-only mode, review the proposed plan, approve implementation in the project's local workspace or an isolated Git worktree, review resulting diffs, and interact via streaming chat.

Every project has its own dedicated local workspace path, configured in project settings or resolved from local Git repository roots.

## Key Decisions

1. **Direct Clean Cutover with Dual-Read Compatibility**:
   - Replace the `internal/agents/codex` background runner with `internal/agents/omp`.
   - Remove reliance on `@agentclientprotocol/codex-acp`. Use the locally installed `omp acp` binary directly over stdio.
   - Non-goals: CLI scaffolding for Codex MCP config (`.codex/config.toml` in `internal/cli`) remains untouched; only the task background coding runner is cut over.
   - Dual-read compatibility: accept both `agentType: "codex"` and `agentType: "omp"` when loading historical task chats and workflows. Write `agentType: "omp"` for new runs and chats.
   - API endpoints:
     - Canonical status endpoint: `GET /api/omp/status`
     - Backward-compatible alias: `GET /api/codex/status`
     - `/api/agent/status` remains dedicated to the OpenCode daemon to prevent route collisions.
2. **Dedicated Per-Project Workspace Directory**:
   - Each project configures its own independent working directory via `settings.workspacePath` in `.know-me/config.json`.
   - Resolution order for OMP working directory (`cwd`):
     1. `store.Config.Settings.WorkspacePath`:
        - Expand leading `~` to user home directory (`os.UserHomeDir`).
        - Resolve relative paths against the project root directory.
        - Canonicalize with `filepath.Abs` and `filepath.EvalSymlinks`.
        - Validate that path exists and is a directory; if configured but invalid, fail closed with an explicit configuration error rather than falling back silently.
     2. `store.RepositoryRoot()`: active Git repository root detected for the project.
     3. `registry.Get(store.ProjectID).Path`: global registry directory mapping.
     4. Clear actionable error if no valid directory is found.
3. **Execution-Root Run Locking**:
   - Run locks (`store.Agent.AcquireRunLock`) are keyed by the **canonical absolute execution root** on disk (`canonicalWorkspaceKey(executionRoot)`), not by `projectID`.
   - This guarantees that two projects sharing a directory or pointing to the same workspace cannot launch overlapping agent runs.
4. **Dynamic ACP Handshake & RPC Engine**:
   - Launch `omp acp` with child process working directory set to the resolved workspace.
   - Use atomic monotonic request IDs (`id: 1, 2, 3...`) with per-step timeouts (10s for initialize, 10s for authenticate, 15s for session/new).
   - Handshake sequence:
     1. `initialize`: send client metadata (`name: "knowme"`, `title: "Know-Me"`, `protocolVersion: 1`).
     2. Dynamic `authenticate`: inspect `authMethods` returned by `initialize`. If `id: "agent"` is present, send `authenticate` with `methodId: "agent"`. If auth fails or credentials missing, fail fast with `Status.LoggedIn = false` and surface `LoginCommand`.
     3. Mode negotiation: select ACP mode (`mode: "plan"` for investigation; `mode: "default"` for implementation/fix).
     4. `session/new`: create a session tied to the target workspace (`cwd: <path>`).
   - Bidirectional RPC loop: handle inbound requests from the agent process (permission requests, tool notifications) with automatic safe responses or auto-approval in worktree mode, preventing agent process deadlocks.
5. **Worktree Isolation & Session Re-binding**:
   - For tasks configured with an isolated worktree (`ActionCreateWorktree`), Git creates a worktree branching from the base repository root (`~/.know-me/worktrees/<project-id>/<task-id>`).
   - Sanitize project and task IDs for filesystem paths and Git branches using `worktreeSegment`.
   - When entering the implementation phase in an isolated worktree, the runner initializes an ACP session with `cwd = workflow.WorktreePath`, seeding context with the approved plan and task description.
6. **Review Gates, State Machine & Clean Workspace Guard**:
   - `plan-review`: Investigation complete; displays plan, files to touch, and verification notes for human approval.
   - Clean workspace check: Before starting implementation directly in the project workspace (non-worktree), verify that `git status --porcelain` is clean. If dirty, require either a clean working copy or worktree creation to avoid mixing uncommitted edits.
   - `code-review`: Implementation complete; captures git diff and dirty file list.
   - Diff contract: Expose `GET /api/tasks/:id/agent/diff` returning a unified patch (capped at 250 KB) for code review.

---

## Architecture & Process Lifecycle

```text
+-------------------------------------------------------------------------+
|                              Know-Me Web UI                             |
|  TaskDetailSheet (Rail/Tabs)  |  Project Settings  |  Config AI Status  |
+------------------------------------+------------------------------------+
                                     | HTTP / SSE
                                     v
+-------------------------------------------------------------------------+
|                           Know-Me HTTP Server                           |
|       /api/omp/status      |    /api/tasks/:id/agent/*   |   /api/chats |
|       (/api/codex/status)  |    (diff, log, action)      |   (send, msg)|
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     internal/agents/omp.Manager                         |
|   +-------------------+  +---------------------+  +-----------------+   |
|   | Workflow Machine  |  | Canonical Run Lock  |  | ACP Client      |   |
|   | (Plan/Code Review)|  | & Worktree Isolator |  | (Dynamic Auth)  |   |
|   +-------------------+  +---------------------+  +--------+--------+   |
+------------------------------------------------------------|------------+
                                                             | stdio JSON-RPC
                                                             v
                                            +-----------------------------+
                                            |       `omp acp` Process     |
                                            |   (cwd: resolved workspace  |
                                            |         or task worktree)   |
                                            +-----------------------------+
```

### 1. Detection and Health Checking
`internal/agents/omp/runner.go`:
1. Check executable via `exec.LookPath("omp")` or env override `KNOWME_OMP_PATH`.
2. Run `omp --version` to extract version string (e.g. `18.2.0`).
3. Return `omp.Status`:
   ```go
   type Status struct {
       Installed      bool   `json:"installed"`
       LoggedIn       bool   `json:"loggedIn"`
       Version        string `json:"version"`
       Executable     string `json:"executable"`
       InstallCommand string `json:"installCommand"`
       LoginCommand   string `json:"loginCommand"`
       DocsURL        string `json:"docsUrl"`
       Error          string `json:"error,omitempty"`
   }
   ```
   * `InstallCommand`: `"brew install can1357/tap/omp"` (macOS/Linux) or `"bun add -g @oh-my-pi/pi-coding-agent"`
   * `LoginCommand`: `"omp auth-broker"` / `"omp token"`
   * `DocsURL`: `"https://github.com/can1357/oh-my-pi"`

### 2. Dynamic ACP Protocol Handshake Sequence
When starting an investigation, implementation, or chat session:
1. Spawn `omp acp` in `cmd.Dir = executionRoot`.
2. Send `initialize`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": 1,
       "clientInfo": { "name": "knowme", "title": "Know-Me", "version": "dev" },
       "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false }, "terminal": false }
     }
   }
   ```
3. Inspect `initialize` response:
   - Check `protocolVersion`. If incompatible, abort with clear version mismatch error.
   - Inspect `authMethods[]`:
     - If `authMethods` contains `{ "id": "agent" }`, send `authenticate`:
       ```json
       {
         "jsonrpc": "2.0",
         "id": 2,
         "method": "authenticate",
         "params": { "methodId": "agent" }
       }
       ```
     - If `authMethods` is empty or does not require credentials, proceed.
     - If authentication fails, fail fast and return actionable `LoginCommand`.
4. Create session with target workspace:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "session/new",
     "params": {
       "cwd": "<execution-root>",
       "mcpServers": []
     }
   }
   ```
5. Store returned `sessionId`.

### 3. Execution, Streaming & Bidirectional Loop
- Concurrent reader routine dispatches incoming JSON-RPC messages:
  - Notifications (`session/update`, `agent_message_chunk`): stream chunks to log buffer and SSE broadcaster (`agent:progress`).
  - Requests from agent: handle permission requests (auto-approve in worktrees, or reject read-only violations during investigation).
- Cap run logs at 4 MiB with automatic truncation indicator.
- On cancelation, dispatch `session/cancel` and terminate process with 3-second SIGTERM grace period before SIGKILL.

---

## Project Workspace Path Resolution & Storage

### 1. Configuration Schema
In `internal/models/config.go`:
```go
type ProjectSettings struct {
    // ... existing settings ...
    WorkspacePath string `json:"workspacePath,omitempty"`
}
```

### 2. Resolution Hierarchy
```go
func ResolveProjectWorkspace(store *storage.Store, reg *registry.Registry) (string, error) {
    if store == nil {
        return "", errors.New("store is required")
    }

    // 1. Explicit project setting
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

    // 2. Active store repository root
    if root := store.RepositoryRoot(); root != "" {
        if canonical, err := filepath.EvalSymlinks(root); err == nil {
            if info, err := os.Stat(canonical); err == nil && info.IsDir() {
                return canonical, nil
            }
        }
    }

    // 3. Fallback to global registry by project ID
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
```

### 3. Canonical Execution Root & Run Lock
```go
func ExecutionRoot(store *storage.Store, reg *registry.Registry, workflow *models.AgentWorkflow) (string, error) {
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

Run lock is keyed by `canonicalWorkspaceKey(execRoot)` so concurrent tasks in separate worktrees run in parallel, while tasks sharing an execution root are serialized.

---

## Task Workflow & Review Gates

### 1. Workflow State Machine

| Task Status | Agent Phase | Description | Actions Available |
| --- | --- | --- | --- |
| `in-progress` | `idle` | Agent idle on task | `start-investigation` |
| `in-progress` | `investigating` | OMP analyzing codebase & task in plan mode | `cancel` |
| `in-progress` | `plan-review` | Plan drafted, awaiting review | `approve-plan`, `request-plan-changes`, `create-worktree` |
| `in-progress` | `implementing` | OMP writing code in workspace/worktree | `cancel` |
| `in-review` | `code-review` | Code changes applied; diff ready | `approve-implementation`, `request-implementation-changes`, `start-fix` |
| `in-progress` | `fix-ready` | Feedback submitted, ready for fix | `start-fix`, `request-plan-changes` |
| `in-progress` | `interrupted` | Process killed or disconnected | `resume`, `cancel` |
| `done` | `completed` | Task approved and finished | — |

### 2. Plan Review & Implementation Gates
- **Plan Review Output**: OMP produces a structured plan with proposed files and verification commands.
- **Clean Workspace Check**: If the user calls `approve-plan` without a worktree, verify git status is clean. If dirty files exist, return `ErrConflict` prompting the user to either commit their working changes or use **Create Worktree**.
- **Worktree Flow**:
  - `ActionCreateWorktree`: creates branch `knowme/<project-id>/<task-id>` and checkout in `~/.know-me/worktrees/<project-id>/<task-id>`.
  - Implementation runs inside the isolated worktree directory.
- **Code Review**:
  - Capture dirty files list via `git status --porcelain=v1`.
  - Capture unified patch via `git diff HEAD`.
  - User reviews diff directly in the Web UI.

---

## API & Data Contracts

### 1. Endpoints
- `GET /api/omp/status`: Returns OMP installation, version, and health status.
- `GET /api/codex/status`: Backward-compatible alias returning the same status structure.
- `GET /api/tasks/:id/agent`: Returns `AgentTaskSnapshot` (workflow state, active run, review comments, dirty files).
- `GET /api/tasks/:id/agent/diff`: Returns unified git diff for the current implementation or fix run.
- `POST /api/tasks/:id/agent/:action`: Dispatches workflow action (`start-investigation`, `approve-plan`, `request-plan-changes`, `approve-implementation`, `request-implementation-changes`, `start-fix`, `create-worktree`, `resume`, `cancel`).
- `GET /api/tasks/:id/agent/runs/:runID/log`: Fetches execution log for a specific run.
- `GET /api/chats/:id`: Returns chat session (`agentType: "omp"` or `"codex"`).
- `POST /api/chats/:id/send` (and alias `/messages`): Sends message or starts chat prompt with OMP.
- `GET /api/config` & `PATCH /api/config`: Retrieves and updates project configuration including `workspacePath`.

### 2. SSE Events
- `agent:updated`: Fired on phase change, run completion, or error.
- `agent:progress`: Fired on streaming chunks and log activity.

---

## Frontend & UI Updates

1. **Task Detail View (`TaskDetailSheet.tsx`, `TaskAgentRail.tsx`, `TaskAgentPanel.tsx`)**:
   - Update tab and rail label to "Agent" / "OMP".
   - Render review gates: Plan Review (with formatted plan) and Code Review (with embedded diff viewer).
   - Show status badges: Investigating, Plan Review, Implementing, Code Review.
2. **Project Settings Page (`ConfigPage.tsx`)**:
   - Add **Project Workspace Directory** input under Settings.
   - Validation indicator:
     - ✅ Verified local directory
     - ⚠️ Path does not exist or is not a directory
     - ℹ️ Auto-detected from repository root when unset
3. **App Status / Integrations Page**:
   - Display OMP agent card: installed version, executable path, and installation helper.

---

## Migration & Backward Compatibility Plan

1. **Dual-Read Storage Migration**:
   - Support `agentType: "codex"` and `agentType: "omp"` across chat and task stores.
   - Retain JSON struct tags for existing stored fields (`codexSessionId` mapped alongside `ompSessionId`).
2. **CLI Scaffolding Preserved**:
   - Do not remove or alter `.codex/config.toml` MCP setup commands in `internal/cli`; those serve external Codex users independently of the background agent runner.
3. **API Backward Compatibility**:
   - Keep `/api/codex/status` as a router alias pointing to the OMP status handler.
   - Retain `/api/chats/{id}/send` as the primary chat send route with `/messages` as alias.

---

## Testing & Verification Plan

1. **Unit Tests (`internal/agents/omp/`)**:
   - `acp_test.go`: Test dynamic handshake (`initialize`, `authenticate`, `session/new`), mode setting (`plan` vs `default`), bidirectional RPC request handling, and error handling with mock ACP process.
   - `runner_test.go`: Test `omp --version` parsing and executable detection.
   - `workflow_test.go`: Test complete lifecycle transitions (`idle` → `investigating` → `plan-review` → `implementing` → `code-review` → `completed`), clean-workspace rejection, worktree session re-binding, and cancelation.
   - `worktree_test.go`: Test worktree creation, branch naming sanitization (`worktreeSegment`), and path isolation.
2. **Storage Tests (`internal/storage/`)**:
   - Test `ResolveProjectWorkspace` with explicit path, relative path, tilde expansion, missing directory error, and fallback to repository root / registry.
   - Test canonical execution root run locking across multi-project scenarios.
3. **HTTP Route Tests (`internal/server/routes/`)**:
   - Verify `/api/omp/status` and alias `/api/codex/status`.
   - Verify task agent actions and `/api/tasks/:id/agent/diff`.
