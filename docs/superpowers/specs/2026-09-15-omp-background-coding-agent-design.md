# Oh My Pi (OMP) Background Coding Agent Design

## Goal

Integrate Oh My Pi (`omp`) as the primary background coding agent for Know-Me tasks via the Agent Client Protocol (ACP) over standard input/output. A user can assign a task to OMP, have OMP investigate the task and codebase, review the proposed plan, approve implementation in the project's local workspace or an isolated Git worktree, review resulting diffs, and interact via streaming chat.

Every project has its own dedicated local workspace path, configured in project settings or resolved from local Git repository roots.

## Key Decisions

1. **Direct Clean Cutover from Codex to OMP**:
   - Replace the `internal/agents/codex` subsystem with `internal/agents/omp`.
   - Remove reliance on `@agentclientprotocol/codex-acp`. Use the locally installed `omp acp` binary directly over stdio.
   - Migrate task chat and session references from `agentType: "codex"` to `agentType: "omp"`.
   - Provide `/api/agent/status` (with a backwards-compatible alias `/api/omp/status` and deprecated fallback for `/api/codex/status`).
2. **Dedicated Per-Project Workspace Directory**:
   - Each project configures its own independent working directory via `settings.workspacePath` in `.know-me/config.json`.
   - Resolution order for OMP working directory (`cwd`):
     1. `store.Config.Settings.WorkspacePath` (explicit per-project override).
     2. `store.RepositoryRoot()` (active Git repository root detected for the project).
     3. `registry.Projects[id].Path` (global registry directory mapping).
     4. Clear error if no valid directory is found or if the target path does not exist on disk.
   - For tasks configured with an isolated worktree, OMP's `cwd` points to that task's isolated worktree path (`~/.know-me/worktrees/<project-id>/<task-id>`).
3. **ACP Handshake & RPC Engine**:
   - Launch `omp acp` with child process working directory set to the resolved workspace.
   - Execute the 3-step ACP handshake:
     1. `initialize`: send client metadata (`name: "knowme"`, `title: "Know-Me"`).
     2. `authenticate`: specify `methodId: "agent"` to adopt existing credentials configured in `~/.omp`.
     3. `session/new`: create a session tied to the target workspace (`cwd: <path>`).
   - Capture `sessionId` from OMP. Retain this session ID across investigation, implementation, and fix prompts so OMP maintains full conversational context.
4. **Structured Review Gates & Workflow State**:
   - Task lifecycle and agent execution states remain distinct.
   - Phases:
     - `idle`: Ready to begin work.
     - `investigating`: OMP analyzes requirements and codebase (prompted for read-only plan generation).
     - `plan-review`: Investigation complete; displays plan, files to touch, and verification notes for human approval.
     - `implementing`: OMP applies code changes and runs tests in workspace or worktree.
     - `code-review`: Implementation complete; displays git diff and modified file list for human approval.
     - `fix-ready`: User requested changes; ready for a follow-up fix run.
     - `interrupted`: Adapter disconnected or server restarted; user can resume explicitly.
     - `completed`: Implementation approved; task advances to `in-review` or `done`.
5. **Run Concurrency & Worktree Isolation**:
   - Only one background coding run modifies a given workspace at a time (enforced via `store.Agent.AcquireRunLock`).
   - Isolated worktrees (`ActionCreateWorktree`) allow parallel task development without dirtying the main project working copy.
6. **Task-Bound Streaming Chat**:
   - Each task has an associated OMP chat session (`agentType: "omp"`).
   - Real-time updates streamed to the frontend via Server-Sent Events (SSE) events `agent:progress` and `agent:updated`.

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
|       /api/agent/status    |    /api/tasks/:id/agent/*   |   /api/chats |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     internal/agents/omp.Manager                         |
|   +-------------------+  +---------------------+  +-----------------+   |
|   | Workflow Machine  |  | Run Lock & Worktree |  | ACP Client      |   |
|   +-------------------+  +---------------------+  +--------+--------+   |
+------------------------------------------------------------|------------+
                                                             | stdio JSON-RPC
                                                             v
                                            +-----------------------------+
                                            |       `omp acp` Process     |
                                            |  (cwd: project workspace)   |
                                            +-----------------------------+
```

### 1. Detection and Health Checking
`internal/agents/omp/runner.go` checks:
1. `exec.LookPath("omp")` (or custom override `KNOWS_OMP_PATH`).
2. Run `omp --version` to extract the version string (e.g. `18.2.0`).
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
   * `InstallCommand`: `"npm install -g @oh-my-pi/pi"` or `"brew install omp"`
   * `LoginCommand`: `"omp auth-broker"` / `"omp token"`
   * `DocsURL`: `"https://github.com/can1357/oh-my-pi"`

### 2. ACP Protocol Handshake Sequence
When starting an investigation, implementation, or chat session:
1. Spawn `omp acp` in `cmd.Dir = resolvedWorkspaceRoot`.
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
3. Receive `initialize` result containing `authMethods: [{"id": "agent", ...}]`.
4. Send `authenticate`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "authenticate",
     "params": { "methodId": "agent" }
   }
   ```
5. Send `session/new`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "session/new",
     "params": {
       "cwd": "<resolved-workspace-path>",
       "mcpServers": []
     }
   }
   ```
6. Store the returned `sessionId`.

### 3. Execution & Streaming
- Send `session/prompt` with the task context, requirements, and execution instructions.
- Stream chunks arriving with `agent_message_chunk` or progress notifications directly to the run logger and SSE broadcaster.
- Extract structured plan or test results at phase transitions.
- On cancelation, dispatch `session/cancel` and terminate the child process gracefully.

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

### 2. Storage & Resolution Rules
Stored in `.know-me/config.json` per project.
Resolution algorithm for any project store:
```go
func ResolveProjectWorkspace(store *storage.Store, reg *registry.Registry) (string, error) {
    // 1. Explicit project setting
    if store != nil && store.Config != nil {
        cfg, err := store.Config.Load()
        if err == nil && strings.TrimSpace(cfg.Settings.WorkspacePath) != "" {
            p := filepath.Clean(cfg.Settings.WorkspacePath)
            if info, err := os.Stat(p); err == nil && info.IsDir() {
                return p, nil
            }
            return "", fmt.Errorf("configured workspacePath does not exist: %s", p)
        }
    }

    // 2. Active store repository root
    if store != nil && store.RepositoryRoot() != "" {
        p := filepath.Clean(store.RepositoryRoot())
        if info, err := os.Stat(p); err == nil && info.IsDir() {
            return p, nil
        }
    }

    // 3. Fallback to global registry by project ID
    if store != nil && reg != nil && store.ProjectID != "" {
        if proj, ok := reg.Find(store.ProjectID); ok && strings.TrimSpace(proj.Path) != "" {
            p := filepath.Clean(proj.Path)
            if info, err := os.Stat(p); err == nil && info.IsDir() {
                return p, nil
            }
        }
    }

    return "", errors.New("no valid local project workspace directory found; configure workspacePath in project settings")
}
```

---

## Task Workflow & Review Gates

### 1. Workflow State Machine

| Task Status | Agent Phase | Description | Actions Available |
| --- | --- | --- | --- |
| `in-progress` | `idle` | Agent idle on task | `start-investigation` |
| `in-progress` | `investigating` | OMP analyzing codebase & task | `cancel` |
| `in-progress` | `plan-review` | Plan drafted, awaiting review | `approve-plan`, `request-plan-changes`, `create-worktree` |
| `in-progress` | `implementing` | OMP writing code in workspace/worktree | `cancel` |
| `in-review` | `code-review` | Code changes applied; diff ready | `approve-implementation`, `request-implementation-changes`, `start-fix` |
| `in-progress` | `fix-ready` | Feedback submitted, ready for fix | `start-fix`, `request-plan-changes` |
| `in-progress` | `interrupted` | Process killed or disconnected | `resume`, `cancel` |
| `done` | `completed` | Task approved and finished | — |

### 2. Worktree Isolation Flow
1. User clicks **Create Worktree** during `plan-review`.
2. Know-Me runs `git worktree add -b knowme/<project-id>/<task-id> ~/.know-me/worktrees/<project-id>/<task-id> HEAD`.
3. Agent workflow records `WorktreePath` and `WorktreeBranch`.
4. Subsequent implementation and fix prompts execute inside `WorktreePath`.
5. On final approval, worktree can be committed/merged or inspected by the user.

---

## API & Data Contracts

### 1. Endpoints
- `GET /api/agent/status` (and alias `/api/omp/status`): Returns OMP installation and version status.
- `GET /api/tasks/:id/agent`: Returns `AgentTaskSnapshot` (workflow state, active run, review comments, diffs).
- `POST /api/tasks/:id/agent/:action`: Dispatches workflow action (`start-investigation`, `approve-plan`, `request-plan-changes`, `approve-implementation`, `request-implementation-changes`, `start-fix`, `create-worktree`, `resume`, `cancel`).
- `GET /api/tasks/:id/agent/runs/:runID/log`: Fetches execution log for a specific run.
- `GET /api/chats/:id`: Returns chat session (`agentType: "omp"`).
- `POST /api/chats/:id/messages`: Sends message or starts chat prompt with OMP.

### 2. SSE Events
- `agent:updated`: Fired on phase change, run completion, or error.
- `agent:progress`: Fired on streaming chunks and log activity.

---

## Frontend & UI Updates

1. **Task Detail View (`TaskDetailSheet.tsx`, `TaskAgentRail.tsx`, `TaskAgentPanel.tsx`)**:
   - Rename all remaining user-facing references from "Codex" to "Agent (Oh My Pi)" or "OMP".
   - Rail tab label: "Agent" (with OMP badge when active).
   - Display current agent phase: Investigation, Plan Review, Implementing, Code Review.
   - Embed diff viewer for code review phase.
2. **Project Settings Page (`ConfigPage.tsx`)**:
   - Add **Project Workspace Directory** field:
     - Editable path input.
     - Live validation badge: Valid Directory / Does Not Exist.
     - Helper text showing effective resolved path.
3. **App Status / Integrations Page**:
   - Show OMP agent status card: installed version, binary location, and quick links to documentation.

---

## Migration & Cutover Plan

1. **Package Cutover**:
   - Rename/replace `internal/agents/codex/` with `internal/agents/omp/`.
   - Update `internal/server/server.go` and `internal/server/routes/` to bind `omp.Manager`.
2. **Chat Sessions Migration**:
   - Any historical task chat sessions with `agentType: "codex"` are transparently handled or migrated to `"omp"` so existing task chat history is preserved.
3. **Frontend API Client**:
   - Update `ui/src/api/client.ts` to call `/api/agent/status` and `/api/tasks/:id/agent/*`.
   - Rename UI models (`ui/src/models/agent.ts`) to generic agent models (`AgentStatus` replacing `CodexStatus`).

---

## Testing & Verification Plan

1. **Unit Tests (`internal/agents/omp/`)**:
   - `acp_test.go`: Test JSON-RPC handshake (`initialize`, `authenticate`, `session/new`), error handling, and prompt streaming using a mock ACP subprocess.
   - `runner_test.go`: Test `omp` binary detection and `--version` parsing.
   - `workflow_test.go`: Test state transitions (`idle` → `investigating` → `plan-review` → `implementing` → `code-review` → `completed`), review rejection loops, and run cancelation.
   - `worktree_test.go`: Test worktree creation, branch naming, and path isolation.
2. **Storage & Path Tests (`internal/storage/`)**:
   - Test per-project `workspacePath` resolution hierarchy (project settings > repo root > registry path > error).
3. **Integration & Smoke Testing**:
   - Launch `omp acp` against a sample project directory.
   - Create a task, trigger investigation, approve plan, verify implementation execution, and verify git diff generation.
