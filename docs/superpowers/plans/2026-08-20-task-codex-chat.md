# Task-Scoped Codex Chat Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one persistent, interactive Codex conversation to every task, reuse the task's ACP session for Auto and gated workflow prompts, stream the transcript through the existing SSE bus, and present it as a resizable desktop rail or a smaller-sheet tab.

**Architecture:** `ChatStore` owns the readable transcript and `AgentStore` owns workflow/run state. `AgentWorkflow.ChatSessionID` links the two. `codex.Manager` remains the only ACP owner and exposes a task-chat entry point; chat routes validate task eligibility and delegate to that manager. The existing `ChatThread`, SSE event names, task-agent routes, and task detail layout are extended in place.

**Tech Stack:** Go models/storage/routes, ACP session adapter, existing SSE broadcaster, React 19/TypeScript, existing `ChatThread`, native CSS grid/pointer events/ARIA tabs, Playwright E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-20-task-codex-chat-design.md`

## Global Constraints

- Preserve unrelated worktree changes in `README.md`, `README.vi.md`, and `README.zh-CN.md`.
- Use the existing JSON stores, ACP session, SSE event names, Markdown renderer, and UI primitives. Do not add a dependency, database, second transcript format, second ACP client, or global OpenCode/Codex chat surface.
- Keep danger-full-access out of every new path. Auto uses the existing ACP workspace-write permission policy.
- A task-bound Codex chat is created lazily, is not independently deletable, survives archive, and is deleted only by permanent task deletion.
- Gated workflow transitions remain authoritative. Auto chat never approves a gate or changes task status.
- A streaming assistant response is one durable message updated by ID; raw ACP/tool telemetry remains the run log.
- Every non-trivial branch has a focused test before implementation is considered complete.
- Keep the existing public route setup functions source-compatible for current tests and callers.

---

## Task 1: Extend the shared models and durable chat-store contract

**Files:**

- Modify `internal/models/chat.go`.
- Modify `internal/models/agent.go`.
- Modify `internal/storage/chat_store.go`.
- Modify `internal/storage/store.go`.
- Create `internal/storage/chat_store_test.go`.
- Modify or extend `internal/storage/agent_store_test.go`.
- Modify `ui/src/models/chat.ts`.
- Modify `ui/src/models/agent.ts`.

### Steps

- [ ] Write storage tests first for the exact public behavior:

  ```go
  func TestChatStoreFindTaskSessionScopesByProjectAndAgent(t *testing.T) {
      store := newTestChatStore(t, "project-a")
      saveChat(t, store, &models.ChatSession{ID: "a", ProjectID: "project-a", TaskID: "12", AgentType: "codex"})
      saveChat(t, store, &models.ChatSession{ID: "b", ProjectID: "project-b", TaskID: "12", AgentType: "codex"})
      saveChat(t, store, &models.ChatSession{ID: "c", ProjectID: "project-a", TaskID: "12", AgentType: "opencode"})

      session, err := store.FindTaskSession("project-a", "12", "codex")
      if err != nil || session.ID != "a" {
          t.Fatalf("FindTaskSession() = %#v, %v; want project-a Codex session a", session, err)
      }
  }

  func TestChatStoreDeleteTaskSessionsIsIdempotent(t *testing.T) {
      store := newTestChatStore(t, "project-a")
      saveChat(t, store, &models.ChatSession{ID: "a", ProjectID: "project-a", TaskID: "12", AgentType: "codex"})

      if err := store.DeleteTaskSessions("project-a", "12"); err != nil {
          t.Fatal(err)
      }
      if err := store.DeleteTaskSessions("project-a", "12"); err != nil {
          t.Fatal(err)
      }
      if _, err := store.Get("a"); err == nil {
          t.Fatal("deleted task chat is still present")
      }
  }
  ```

- [ ] Add backwards-compatible `ProjectID` to `models.ChatSession`, optional `RunID` and `Phase` to `models.ChatMessage`, and `AgentRunPhaseChat` alongside investigation/implementation/fix. Add `ChatSessionID` to `AgentWorkflow` and `AgentTaskSnapshot`; use JSON names `projectId`, `runId`, `phase`, and `chatSessionId`.
- [ ] Add `projectID` to `ChatStore` initialization in `storage.newStore`. Keep old chat JSON readable when `projectId` is absent; task-bound Codex lookups must require the current project ID, while unscoped legacy chats continue to work through `Get` and `List`.
- [ ] Add the minimum store methods:

  ```go
  func (cs *ChatStore) FindTaskSession(projectID, taskID, agentType string) (*models.ChatSession, error)
  func (cs *ChatStore) DeleteTaskSessions(projectID, taskID string) error
  ```

  `FindTaskSession` returns the existing session or a typed not-found error. `DeleteTaskSessions` filters matching task-bound sessions and succeeds when none exist, so lifecycle retries are safe.
- [ ] Ensure `ChatStore.Save` preserves a session's `UpdatedAt` and does not silently create two Codex sessions for the same `(projectId, taskId)`. The manager will perform the read/create/save sequence under its mutex; the store remains a simple JSON store.
- [ ] Add model round-trip assertions for a Codex session and chat message carrying `runId`/`phase`, plus agent snapshot/workflow round-trip assertions. Keep optional fields omitted for existing sessions.
- [ ] Mirror the contract in `ui/src/models/chat.ts` and `ui/src/models/agent.ts`: `agentType` accepts `"codex"`, `ChatMessage` includes optional `runId` and `phase`, and the snapshot/workflow types expose `chatSessionId`.
- [ ] Run the focused model/storage tests and `git diff --check` before moving on.

**Expected result:** the backend and frontend agree on a durable, project-scoped one-session-per-task link without changing existing OpenCode/Claude records.

---

## Task 2: Add text prompting and task-chat execution to the ACP manager

**Files:**

- Modify `internal/agents/codex/workflow.go`.
- Create `internal/agents/codex/chat.go`.
- Modify `internal/agents/codex/acp.go`.
- Modify `internal/agents/codex/acp_test.go`.
- Create `internal/agents/codex/chat_test.go`.
- Modify `internal/agents/codex/workflow_test.go`.

### Interfaces and event contract

- [ ] Extend the private ACP session interface with a text-only prompt method that shares the existing update stream:

  ```go
  type acpSession interface {
      NewSession(context.Context) error
      LoadSession(context.Context, string) error
      SetMode(context.Context, ACPMode) error
      Prompt(context.Context, string, func(ACPUpdate)) (string, error)
      PromptText(context.Context, string, func(ACPUpdate)) (string, error)
      Cancel(context.Context) error
      Close(context.Context) error
      SessionID() string
  }
  ```

  `Prompt` remains the strict JSON workflow path. `PromptText` returns ordinary assistant text and uses the same ACP process/request lifecycle; do not duplicate process parsing or validation logic.
- [ ] Add a chat event type in `internal/agents/codex/chat.go`:

  ```go
  type ChatEvent struct {
      Type      string
      ProjectID string
      TaskID    string
      ChatID    string
      Session   *models.ChatSession
      Message   *models.ChatMessage
  }
  ```

  Extend `NewManager` with an optional variadic chat emitter so all existing two-argument test and production calls remain valid:

  ```go
  func NewManager(executable string, emit func(Event), chatEmit ...func(ChatEvent)) *Manager
  ```

  Store the first optional emitter and emit full session/message snapshots for `created`, `updated`, and `message` events. The server will translate them to SSE in Task 3.

### TDD behavior

- [ ] Add failing manager tests with the existing fake ACP session for these exact cases:

  ```go
  func TestStartChatCreatesLinkedSessionAndStreamingMessage(t *testing.T)
  func TestStartChatReusesACPSessionAndLeavesWorkflowPhaseUnchanged(t *testing.T)
  func TestStartChatRejectsGatedAndCompletedPhases(t *testing.T)
  func TestStartChatQueuesAutoMessageWhileChatRunIsActive(t *testing.T)
  func TestStartChatRejectsWhenGatedRunOwnsTask(t *testing.T)
  func TestChatInterruptionPreservesPartialAssistantAndRequiresResume(t *testing.T)
  func TestGatedRunAppendsActionAndAssistantToTaskChat(t *testing.T)
  ```

  Assert durable user message, assistant placeholder, one stable assistant message ID across updates, `AgentRunPhaseChat`, `ChatSession.SessionID`, `AgentWorkflow.ChatSessionID`, `ChatSession.Status`, queue behavior, and no task status/phase mutation on Auto success.
- [ ] Implement the smallest manager entry points:

  ```go
  func (m *Manager) StartChat(ctx context.Context, store *storage.Store, taskID, content string) error
  func (m *Manager) StopChat(ctx context.Context, store *storage.Store, taskID string) error
  ```

  `StartChat` must validate the task, current workflow, Codex installation/login, project repository, and active run before persisting a user message. It accepts only `in-progress` tasks in `idle` or `fix-ready`, unless the same task already has an Auto chat run and the route is processing its queued message.
- [ ] Add a manager helper that loads or creates the task Codex session, links `AgentWorkflow.ChatSessionID`, sets `ChatSession.AgentType` to `codex`, sets `TaskID`/`ProjectID`, and persists the link before ACP starts. If any durable write fails, return before creating an active run.
- [ ] Record a chat `AgentRun`, set `ChatSession.Status` to `streaming`, append the user turn and one empty assistant placeholder, then launch the existing session execution path. Reuse `ensureSession`, `persistSession`, `active`, the project `AgentRunLock`, and `modeForPhase`; Auto must use `ACPModeAgent`/workspace-write and never the investigation mode.
- [ ] On each ACP update, replace the same assistant message content, update `UpdatedAt`, save the chat session, and emit `ChatEvent{Type:"message"}`. Emit a session update when status or queue changes. Keep raw update kinds out of `ChatMessage`.
- [ ] On success, save the final assistant text and run summary/status, restore the prior workflow phase without changing task status, recalculate dirty files through the existing snapshot path, and process the next queued Auto message after releasing the manager mutex.
- [ ] On cancellation, ACP disconnect, server shutdown, malformed text/persistence failure, and non-zero adapter failure, persist the partial assistant message and run status. Use existing interrupted/resume state for ACP interruption; add only the minimum restore-phase field if the existing `ResumePhase` cannot restore `fix-ready` after a chat interruption. Do not delete the transcript or ACP session ID.
- [ ] Make `StopChat` cancel only an active Auto chat run for the requested task and return the existing conflict error for a gated run or missing run.
- [ ] Update gated `Act` paths so each visible action/comment is appended to the linked task chat before the ACP prompt and each readable `Result.Output` is appended as an assistant message with the run's phase. Review comments remain in `AgentState.ReviewComments` as the authoritative structured record.
- [ ] Add queue draining inside the manager rather than the route: one queue item is removed only when it is about to start, and a queued message is never started while a gated run is active. Keep the existing maximum queue length of 10.
- [ ] Run `go test ./internal/agents/codex` and confirm the fake ACP tests cover both JSON workflow prompts and ordinary text chat prompts.

**Expected result:** one manager owns every task ACP interaction, Auto messages stream into a durable transcript, and existing gated workflow semantics remain unchanged.

---

## Task 3: Wire Codex chat through routes, SSE, server startup, and task deletion

**Files:**

- Modify `internal/server/routes/chat.go`.
- Create or extend `internal/server/routes/chat_test.go`.
- Modify `internal/server/routes/router.go`.
- Modify `internal/server/server.go`.
- Modify `internal/server/routes/tasks.go`.
- Extend `internal/server/routes/agent_test.go` if shared setup is the smallest test path.

### Steps

- [ ] Add a narrow route dependency contract so route tests can use a fake without constructing ACP:

  ```go
  type CodexChatRunner interface {
      StartChat(context.Context, *storage.Store, string, string) error
      StopChat(context.Context, *storage.Store, string) error
  }
  ```

  Add an optional `codexChat CodexChatRunner` field to `ChatRoutes`.
- [ ] Preserve `SetupRoutes`, `SetupRoutesWithCapabilities`, and `SetupRoutesWithCapabilitiesAndLSPStatusProvider` signatures. Add `SetupRoutesWithCapabilitiesAndLSPStatusProviderAndCodex` with the Codex runner before the existing workspace-switch callback and make the older functions delegate with `nil`.
- [ ] Pass `s.codexManager` through the new setup function in `internal/server/server.go`. Register the manager's optional chat emitter there; translate `ChatEvent` into the existing broadcaster payloads exactly as follows:

  ```text
  created -> chats:created  {session}
  updated -> chats:updated  {session}
  message -> chats:message  {chatId, message}
  ```

  Do not expose ACP raw events on `chats:message`.
- [ ] Extend `createSession` to accept `agentType:"codex"` only when a task ID is supplied and the task exists. Reuse an existing linked task chat instead of creating a second session. Allow `getSession` to return task-bound Codex sessions; keep the existing OpenCode service-unavailable behavior intact.
- [ ] Extend `sendMessage`:

  - validate task-bound Codex ownership and non-empty content;
  - when a gated run owns the task, return the existing conflict response without appending or queueing;
  - when an Auto chat is streaming, reuse the existing max-10 queue and emit the updated session;
  - otherwise call `CodexChatRunner.StartChat` and return the accepted/session response;
  - map `ErrConflict`, missing task/session, missing setup, and persistence failures to the route's existing error style.

- [ ] Extend `stopChat` to delegate task-bound Codex sessions to `StopChat`; leave existing session-status behavior for Claude/OpenCode. Make `processQueue` either drain through the manager or return the existing queue response without starting a second worker; the manager is the only queue consumer.
- [ ] Reject direct deletion of a task-bound Codex session with a conflict response and leave unrelated chat deletion behavior unchanged.
- [ ] Add route tests for:

  ```go
  func TestCodexChatGetAndSendDelegatesToManager(t *testing.T)
  func TestCodexChatRejectsSendDuringGatedRun(t *testing.T)
  func TestCodexChatQueuesWhileAutoRunStreams(t *testing.T)
  func TestCodexChatCannotBeDeletedIndependently(t *testing.T)
  func TestTaskHardDeleteRemovesCodexChatButArchivePreservesIt(t *testing.T)
  ```

  Assert the fake runner receives the current store/task/content, the response does not invoke ACP from the HTTP handler, queue length never exceeds 10, and lifecycle retries remain idempotent.
- [ ] In `TaskRoutes.lifecycleService`, extend the permanent-delete `RemoveTask` hook to call `store.Chats.DeleteTaskSessions(store.ProjectID, taskID)` after search reconciliation. Do not call it from archive/unarchive hooks. A missing chat is success.
- [ ] Verify server startup still calls `ChatStore.MarkAllIdle`, agent interruption recovery remains intact, and route setup tests that do not inject a Codex manager still pass.
- [ ] Run `go test ./internal/server/routes ./internal/server` and `git diff --check`.

**Expected result:** HTTP chat operations and SSE live updates use the existing server plumbing, and permanent task deletion cleans up the linked transcript without touching archive behavior.

---

## Task 4: Add frontend Codex chat state, API typing, and message upserts

**Files:**

- Modify `ui/src/api/client.ts`.
- Modify `ui/src/contexts/SSEContext.tsx` only if payload parsing/types need the new optional fields.
- Modify `ui/src/contexts/ChatContext.tsx`.
- Modify `ui/src/models/chat.ts` and `ui/src/models/agent.ts` if Task 1 reveals type alignment gaps.
- Create `ui/src/components/organisms/TaskDetail/TaskCodexChat.tsx`.

### Steps

- [ ] Keep `chatApi` endpoint signatures generic enough for both providers, but type the Codex path explicitly: `getSession`, `sendMessage`, `stopChat`, `getQueue`, and the existing SSE payloads must accept `agentType:"codex"` and `taskId`.
- [ ] Change chat SSE consumers to upsert a message by `message.id` rather than skip any event whose ID is already present. Preserve message order by replacing in place and append only unseen IDs. This is required for streaming updates and must not alter OpenCode message rendering.
- [ ] Implement `TaskCodexChat` by reusing `ChatThread` for history and Markdown. Do not reuse the large OpenCode-specific `ChatInput`; add one small task composer with the existing `Textarea` and `Button` primitives.
- [ ] Give `TaskCodexChat` this explicit prop contract:

  ```ts
  interface TaskCodexChatProps {
      taskId: string;
      taskStatus: Task["status"];
      snapshot: AgentTaskSnapshot | null;
      codexStatus: CodexStatus | null;
      onRefresh: () => Promise<void>;
  }
  ```

  Load the linked session ID from `snapshot.workflow.chatSessionId`, fetch it on change, and refetch after `chats:created`, `chats:updated`, completion, failure, cancellation, interruption, and agent updates.
- [ ] Subscribe only to chat events for the current `chatId`; merge `chats:message` by ID and replace the full session on `chats:created`/`chats:updated`. Reopening the task must rebuild the transcript from `GET /api/chats/{id}`, not browser-local state.
- [ ] Implement composer eligibility from the approved rules: task `in-progress`, phase `idle` or `fix-ready`, Codex installed/logged in, no active gated run, no interrupted/completed state. Render a useful disabled explanation for setup, gated phase, active run, interruption, and completed task.
- [ ] On submit, trim and reject empty content, call `chatApi.sendMessage`, clear only after the request is accepted, and show queued state when the session is already streaming. Add Enter-to-send with Shift+Enter for a newline; expose an explicit Send button for keyboard and pointer users.
- [ ] Add Stop and Resume affordances that delegate to the existing agent action/stop endpoint as appropriate. Keep review/gate controls outside the composer; the chat is not a command parser.
- [ ] Keep the chat message footer metadata minimal: use `phase`/`runId` only when it helps explain a workflow turn, and never render raw ACP JSON/tool payloads as chat bubbles.

**Expected result:** the task chat has durable history, stable streaming bubbles, clear Auto eligibility, and no regression to the global OpenCode chat.

---

## Task 5: Integrate chat with the existing task-agent workflow panel

**Files:**

- Modify `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`.
- Modify `ui/src/components/organisms/TaskDetail/TaskDetailSheet.tsx` only to remove the old inline placement in this task; the layout move is completed in Task 6.

### Steps

- [ ] Render `TaskCodexChat` as the primary content of `TaskAgentPanel`, using the existing `snapshot`, `codexStatus`, `load`, and task refresh callbacks. Keep the current phase badge, setup warning, gate buttons, review comment textarea, latest run summary, tests, log, dirty-file list, and review history as workflow controls below the chat.
- [ ] Make the panel accept an optional `embedded`/rail presentation prop so the same component works in the desktop rail and smaller Codex tab without changing its data behavior.
- [ ] Keep existing gate button rules and labels. Disable gate actions when a run is active; keep Auto disabled in every formal workflow phase. Do not make a chat send mutate `snapshot.workflow.phase` locally.
- [ ] Subscribe to both `agent:updated` and `agent:progress` as today. On a terminal agent event, reload both the snapshot and task chat so run summaries and the transcript converge from the backend.
- [ ] Ensure `TaskAgentPanel` does not render a second task-chat heading when embedded in the rail and uses one accessible region label such as `Codex task agent`.
- [ ] Run the TypeScript build after this integration before adding layout interaction; fix type errors at their source rather than casting API payloads to `any`.

**Expected result:** chat and formal workflow controls coexist in one Codex surface and share the same snapshot/run lifecycle.

---

## Task 6: Build the desktop rail, persisted resize, and smaller-sheet tabs

**Files:**

- Create `ui/src/components/organisms/TaskDetail/TaskCodexRail.tsx`.
- Modify `ui/src/components/organisms/TaskDetail/TaskDetailSheet.tsx`.
- Modify `ui/src/contexts/UIPreferencesContext.tsx`.

### Steps

- [ ] Add `taskCodexRailWidth: number` to UI preferences with a default of `384`, clamp loaded/stored values to `320..560`, and persist changes through the existing `knowns-ui-preferences` mechanism. Do not create a new preference store.
- [ ] Implement `TaskCodexRail` with a native pointer drag divider and keyboard support:

  ```tsx
  <button
      type="button"
      aria-label="Resize Codex panel"
      onPointerDown={startResize}
      onKeyDown={adjustWidth}
  />
  ```

  Pointer movement changes width relative to the dialog's right edge; `ArrowLeft`/`ArrowRight` change by 16px; `Home`/`End` select minimum/maximum; release/blur persists the clamped value. The handle is hidden outside maximized desktop layout.
- [ ] Change maximized desktop content to three independently understandable columns:

  ```text
  flex-1 min-w-0 task content | shrink-0 w-72 metadata | shrink-0 codex rail
  ```

  Keep the fixed metadata width and give the task content, metadata, and Codex rail their own `ScrollArea` regions. Render `TaskAgentPanel` only in the Codex rail, not inside `MainContent`.
- [ ] Keep the rail header visible while its chat/history body scrolls. The rail must expose current phase/session state, refresh, stop/resume controls, and the composer without clipping at the dialog edge.
- [ ] In smaller sheets and mobile, add native `role="tablist"` controls with `Task` and `Codex` tabs. The Task tab contains the current compact metadata and all existing task content; the Codex tab contains the full `TaskAgentPanel`. Do not render a resize handle in this mode.
- [ ] Preserve existing dialog/sheet animation, close, maximize, lifecycle dialogs, internal link navigation, and sidebar actions. Keep the active smaller-sheet tab local to the open task and reset it to `Task` when task ID changes.
- [ ] Add accessible focus behavior: the active tab has `aria-selected`, each tab controls a labelled panel, the resize button has visible focus styling, and chat controls remain reachable at narrow widths.
- [ ] Run the UI build and manually verify at a maximized desktop width, a narrow sheet width, and mobile viewport before writing browser assertions.

**Expected result:** desktop shows `task content | metadata | resizable Codex rail`; smaller sheets show `Task | Codex` tabs with no horizontal overflow or resize control.

---

## Task 7: Add focused browser coverage for history, streaming, eligibility, and layout

**Files:**

- Modify `ui/e2e/codex-agent.spec.ts`.
- Create or extend `ui/e2e/task-detail.spec.ts` only if the existing Codex spec cannot cover layout without duplicating fixtures.

### Steps

- [ ] Extend the existing API/SSE mocks with a task-bound `ChatSession`, `GET /api/chats/{id}`, `POST /api/chats/{id}/send`, `POST /api/chats/{id}/stop`, and full-message `chats:message` events. Keep existing agent mocks and task data.
- [ ] Add a test that opens a task, sees the Codex rail, sends an Auto message, receives two `chats:message` events with the same assistant ID, and asserts one assistant bubble contains the final text rather than two bubbles.
- [ ] Add a reopen test: close the task, reopen it, and assert the mocked persisted user and assistant history is present without sending another request from the browser composer.
- [ ] Add eligibility tests for `idle`, `fix-ready`, `plan-review`, `implementing`, `interrupted`, and completed/non-in-progress tasks. Assert the composer is enabled only for the two approved Auto phases and the disabled reason is visible.
- [ ] Add a gated coexistence test that starts investigation, confirms the chat composer is disabled while the run is active, then emits completion and confirms the phase/gate controls and transcript refresh without changing the task chat ID.
- [ ] Add layout tests at desktop and narrow viewport sizes: assert the three-column desktop structure, drag the resize handle and verify width changes, reload and verify the persisted width, then assert smaller `Task`/`Codex` tabs and no resize handle.
- [ ] Run `bun run test:e2e -- ui/e2e/codex-agent.spec.ts` (or the repository's configured Playwright command) and fix only behavior regressions exposed by these tests.

**Expected result:** the requested persistence, streaming upsert, Auto/gated coexistence, resize memory, and responsive tab behavior are covered by executable UI checks.

---

## Task 8: Verify the complete change and hand off cleanly

**Files:**

- No new implementation files; update only tests or docs if verification exposes a real contract mismatch.

### Steps

- [ ] Run focused backend checks:

  ```sh
  go test ./internal/models ./internal/storage ./internal/agents/codex ./internal/server/routes
  ```

- [ ] Run the frontend build and focused Playwright tests:

  ```sh
  cd ui
  bun run build
  bun run test:e2e -- ui/e2e/codex-agent.spec.ts
  ```

- [ ] Run the repository's normal validation command if one is documented in `README.md`, `CONTRIBUTING.md`, or `Makefile`; do not invent a new validation script.
- [ ] Run `git diff --check`, inspect `git status --short`, and verify the only intended changes are the task Codex chat implementation, tests, and this plan/spec. Preserve existing README changes and the visual brainstorming artifacts.
- [ ] Review the final diff for accidental danger-full-access flags, raw ACP payloads in chat messages, duplicate chat creation, task status mutation from Auto, and independent task-chat deletion.
- [ ] Report exact test commands and results, plus any environment-only checks that could not run.

**Expected result:** the feature is verified with evidence and the worktree is ready for the user's preferred integration workflow.

---

## Plan self-review

- The plan implements the approved spec without adding a second chat renderer, store, ACP client, or global Codex chat surface.
- Each task names concrete files, public interfaces, state transitions, and executable tests.
- Route setup remains source-compatible; the only new server dependency is the existing `codex.Manager` behind a narrow chat runner contract.
- The only browser-local state introduced is the requested rail width and active smaller-sheet tab.
- Persistence failures, active-run conflicts, interruption, queueing, task deletion, responsive layout, accessibility basics, and streaming message identity are explicitly covered.
