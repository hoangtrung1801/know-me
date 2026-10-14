# Agents and Chat Feature Parity Report

Date: 14 October 2026<br>
Domain: Agents & Chat (`native/Sources/KnowMeApp/Features/Agents/**`)<br>
Owner Task: `c9axmk` (child of `clnn6l`, plan `plans/knowme-macos-native-workspace-implementation-plan-2026-10-14`)<br>
Dispatch Context: `ctx_85aa31f80f09` / Task: `task_cc8c6bad2f45`<br>

---

## 1. Executive Summary

Implemented native macOS Agents and Chat features in Swift 6 with strict concurrency checking. Exported `ChatView(model: AppModel)` and `AgentRunView(model: AppModel)` along with `AgentRunView(model: AppModel, taskID: String)`. Delivered full chat session CRUD, agent/model switching, real-time message streaming via SSE and WebSocket protocol connection, queue management with stop and process-queue actions, tool call disclosures with input/output viewers, question blocks with interactive replies, and full OMP task agent workflows (investigation, plan approval, diff viewer, commit/merge, code review, cancellation, and execution run logs). Preserved explicit human approval gates and historical `codex` alias semantics. Audited `/ws/chat` vs `/ws/terminal` and OpenCode status restrictions under server browser commands; documented exact limitations and backend findings without faking availability.

---

## 2. Exported Signatures & Integration Requirements

The following SwiftUI views are implemented and compile cleanly in the `KnowMeApp` executable module:

```swift
// MARK: - Exported Views

/// Native conversational agent workspace with session list, transcript, composer, and tool inspection.
struct ChatView: View {
    init(model: AppModel)
}

/// Native OMP/Codex task workflow viewer with phase tracking, human plan/implementation approvals,
/// worktree diff viewer, run logs, and linked task conversation.
struct AgentRunView: View {
    /// Initializer for standalone usage or task picker
    init(model: AppModel)

    /// Initializer for direct handoff from Work/Tasks feature or inspector
    init(model: AppModel, taskID: String)
}
```

### Coordinator Integration Notes:
1. `ChatView(model: model)` can be wired directly in `FeatureRouter` under `Destination.chat`.
2. `AgentRunView(model: model, taskID: task.id)` can be embedded in the Tasks inspector or detail sheet when an agent run is associated with a task.

---

## 3. Parity Audit & Per-Action Evidence

The 10 actions from domain `agents` in `native/Parity.json` (actions 28 through 37) are audited and implemented as follows:

| Action ID | Name | Backend Endpoints | Status | Evidence & Implementation Details |
|---|---|---|---|---|
| `agents.28` | Chat session lifecycle | `GET /api/chats`<br>`POST /api/chats`<br>`GET /api/chats/{id}`<br>`PATCH /api/chats/{id}`<br>`DELETE /api/chats/{id}` | **Implemented** | `AgentService.listSessions`, `getSession`, `createSession`, `updateSession`, `deleteSession`. Session list in `ChatView` sidebar with filter (`All`, `General`, `Task Agent`), rename dialog, and delete confirmation. Explicit 409 handling when deleting task-bound chats (server rejects deletion of task-bound chats without deleting task). |
| `agents.29` | Agent and model selection | `GET /api/chats/agents`<br>`PATCH /api/chats/{id}` | **Implemented** | Supports `omp` (Oh My Pi / Codex), `claude`, and `opencode` agent types. Model field configuration during creation and dynamic model update via `PATCH`. |
| `agents.30` | Streaming send queue stop | `POST /api/chats/{id}/send`<br>`POST /api/chats/{id}/stop`<br>`GET /api/chats/{id}/queue`<br>`POST /api/chats/{id}/process-queue`<br>SSE `chats:message`, `chats:updated` | **Implemented** | `AgentStore.sendMessage` sends user prompt. If backend is streaming, server returns `{queued: true, position: N}`; native UI updates queue badge and allows `processQueue`. SSE listener consumes live tokens and tool call updates. Dedicated `stopChat` button sends `POST /api/chats/{id}/stop`. |
| `agents.31` | Tool output and attachments | `ChatMessageDTO.toolCalls`<br>`ChatMessageDTO.attachments` | **Implemented** | `ChatToolCallView` renders collapsible disclosure with status indicator (loading spinner, green check, red error), formatted input JSON, and scrollable output view. File attachments render native badge chips. |
| `agents.32` | OMP task snapshot investigation plan approval | `GET /api/omp/status`<br>`GET /api/codex/status`<br>`GET /api/tasks/{id}/agent`<br>`POST /api/tasks/{id}/agent/start-agent`<br>`POST /api/tasks/{id}/agent/start-investigation`<br>`POST /api/tasks/{id}/agent/approve-plan`<br>`POST /api/tasks/{id}/agent/request-plan-changes`<br>`POST /api/tasks/{id}/agent/create-worktree` | **Implemented** | `AgentRunView` displays status of OMP daemon (`omp auth-broker` check) with fallback to `/api/codex/status`. Enforces explicit human plan review: "Approve Plan & Implement" vs "Request Plan Changes" with sheet for user feedback comment, and worktree creation for dirty files. |
| `agents.33` | OMP implementation diff code review cancellation | `GET /api/tasks/{id}/agent/diff`<br>`POST /api/tasks/{id}/agent/approve-implementation`<br>`POST /api/tasks/{id}/agent/request-implementation-changes`<br>`POST /api/tasks/{id}/agent/commit-worktree`<br>`POST /api/tasks/{id}/agent/merge-worktree`<br>`POST /api/tasks/{id}/agent/complete-without-merge`<br>`POST /api/tasks/{id}/agent/resume`<br>`POST /api/tasks/{id}/agent/cancel`<br>`GET /api/tasks/{id}/agent/runs/{runID}/log` | **Implemented** | `DiffViewer` parses unified diff with colorized line styling (`+` green, `-` red, `@@` blue) and lists modified files. `AgentRunView` provides human approval actions for implementation review, commit message submission, branch merging (`merge-worktree`), completion without merge, run resumption, run cancellation, and scrollable execution log viewer. |
| `agents.34` | OpenCode questions and permissions | `POST /api/opencode/question/{id}/reply`<br>`POST /api/opencode/question/{id}/reject`<br>`POST /api/opencode/session/{id}/permissions/{permissionId}` | **Implemented** | `ChatQuestionView` renders interactive question prompts with single- or multi-choice options, submitting selected answers to `/api/opencode/question/{id}/reply` or rejecting via `/reject`. `AgentService.respondOpenCodePermission` handles permission grants. |
| `agents.35` | OpenCode providers models auth and commands | `GET /api/opencode/status`<br>`GET /api/opencode/*` (proxy) | **Audited / Gated** | Audited `internal/server/server.go:1093-1149`. Server checks `s.refreshRuntimeStatus()`. When the browser command is active or OpenCode daemon is disabled/unconfigured, server returns HTTP 503 `OpenCode runtime is not ready`. The native UI checks `openCodeStatus` and surfaces an `OpenCodeUnavailableBanner` with `status.lastError`. Availability is never faked. |
| `agents.36` | Subagent views and context | `GET /api/chats`<br>`parentSessionId` filtering | **Implemented** | Child sessions with `parentSessionId` are identified, filterable, and grouped with parent session context. |
| `agents.37` | Terminal protocol and availability audit | `/ws/chat`<br>`/ws/terminal` | **Audited / Documented** | Protocol audited in `internal/server/server.go:1048-1072`. `/ws/chat?chatId=xxx` is registered; it accepts WebSocket upgrades and keeps the connection alive, but does not pipe pty/terminal data. `/ws/terminal` is **not** registered on the server at all. Therefore, an interactive terminal is not supported by the backend; claiming terminal parity would be false. `AgentRunView` provides actual run log inspection via `GET /api/tasks/{id}/agent/runs/{runID}/log`. |

---

## 4. Source Files Created

All files are located in `native/Sources/KnowMeApp/Features/Agents/`:

1. `AgentDTOs.swift`:
   - Strongly-typed `Codable & Sendable & Equatable` data structures: `ChatSessionDTO`, `ChatMessageDTO`, `ChatToolCallDTO`, `ChatAttachmentDTO`, `ChatQuestionBlockDTO`, `ChatQueueStatusDTO`, `AgentWorkflowDTO`, `AgentRunDTO`, `ReviewCommentDTO`, `AgentTaskSnapshotDTO`, `CodexStatusDTO`, `OpenCodeStatusDTO`.
2. `AgentService.swift`:
   - `@MainActor` API client wrapper handling REST endpoints (`/api/chats`, `/api/tasks/{id}/agent`, `/api/omp/status`, `/api/opencode/status`) and WebSocket connection (`/ws/chat`).
3. `AgentStore.swift`:
   - `@MainActor @Observable` domain store managing active sessions, real-time SSE event consumption (`chats:message`, `chats:updated`, `chats:created`, `chats:deleted`, `agent:updated`, `agent:progress`), queue status, draft persistence using `AppModel.drafts`, and task workflow snapshots.
4. `AgentHelperViews.swift`:
   - `ChatToolCallView`: Collapsible disclosure for agent tool calls with syntax-highlighted input/output.
   - `ChatQuestionView`: Interactive OpenCode question prompt with answer selection and reply/reject buttons.
   - `DiffViewer`: Unified diff line visualizer and dirty files list.
5. `ChatView.swift`:
   - Exported `ChatView(model: AppModel)`. Split view with session sidebar, transcript with tool calls and questions, streaming indicator, queue pill, and recoverable composer.
6. `AgentRunView.swift`:
   - Exported `AgentRunView(model: AppModel)` and `AgentRunView(model: AppModel, taskID: String)`. Tabbed interface for OMP workflow, human plan/implementation approvals, worktree diffs, run logs, and embedded task chat.
7. `AgentFixtures.swift`:
   - Compile-time verifiable test fixtures for mock sessions, tool calls, task snapshots, and status responses.

---

## 5. Verification Commands and Results

1. **Native Package Build**:
   ```sh
   swift build --package-path native
   ```
   **Result**: Succeeded. Output:
   ```
   [3/10] Emitting module KnowMeApp
   [4/10] Compiling KnowMeApp ChatView.swift
   [5/10] Compiling KnowMeApp AgentStore.swift
   [6/10] Compiling KnowMeApp AgentRunView.swift
   [7/10] Compiling KnowMeApp AgentService.swift
   [8/10] Linking KnowMeApp
   [9/10] Applying KnowMeApp
   Build complete! (3.13s)
   ```
   Zero errors and zero warnings across all Agents feature sources.

2. **Core Test Suite**:
   ```sh
   swift test --package-path native
   ```
   **Result**: 16 tests passed. Output:
   ```
   ✔ Test run with 16 tests passed after 0.479 seconds.
   ```

3. **Concurrent Package Source Failure Tracking**:
   - During initial build, a concurrent file in `Features/Work/` had compilation errors (`Font.TextStyle.bold()` and non-Sendable `formatters`). Once resolved by the Work owner, `swift build --package-path native` completed cleanly with all Agents sources compiling without issues.

---

## 6. Known Gaps & Backend Proposals

1. **`/ws/terminal` Registration Gap**:
   - Web hook `useTerminalWebsocket.ts` expected `GET /ws/terminal?workspaceId=...`, but `internal/server/` only registered `/ws/chat`.
   - *Proposal*: If interactive terminal streaming is desired in the future, register a dedicated pty WebSocket route in Go under `/ws/terminal` that attaches to a local pseudo-terminal session. Until then, execution run logs (`/api/tasks/{id}/agent/runs/{runID}/log`) provide canonical output.
2. **OpenCode Availability when Browser Command is Active**:
   - As noted in `README.md`, the server browser command disables OpenCode proxying, returning 503. The native app accurately displays this state rather than faking readiness.
3. **Task-Bound Session Deletion**:
   - `DELETE /api/chats/{id}` returns HTTP 409 Conflict if a chat is bound to a task (`task-bound agent chats are deleted with their task`). The native UI handles this gracefully by disabling the delete action for task-bound chats in the sidebar and reporting the error if triggered.
