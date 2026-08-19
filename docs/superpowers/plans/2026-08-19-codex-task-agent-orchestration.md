# Codex ACP Task Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the one-shot codex exec workflow with one persistent codex-acp stdio session per task while preserving the existing investigation, review, implementation, and fix gates.

**Architecture:** Keep the current Go manager, JSON agent store, task lifecycle service, SSE broker, and React task panel. Add a small standard-library ACP JSON-RPC client that owns one adapter process/session per task, responds to permission requests with the safest offered allow option, and turns session/update notifications into the existing bounded run log and SSE progress events.

**Tech Stack:** Go 1.24 standard library, existing chi routes and JSON storage, existing task lifecycle/search hooks, React 19/TypeScript, existing SSE context, Playwright.

**Spec:** docs/superpowers/specs/2026-08-19-codex-task-agent-orchestration-design.md

## Global Constraints

- Use the locally installed codex-acp adapter; do not invoke the previous codex exec runner.
- Use one ACP session and one adapter process per task across investigation, implementation, and fix prompts.
- Use ACP read-only for investigation and agent/workspace-write for implementation and fixes; never select agent-full-access or danger-full-access.
- Automatically select an offered allow_always permission option, falling back to allow_once; cancel if no allow option exists.
- Run in the current registered project root; do not create worktrees, branches, queues, or another provider integration.
- Record the run before its prompt starts, persist the ACP session ID, and require an explicit Resume after restart or adapter disconnect.
- Keep review comments separate from task implementation notes and use the existing task lifecycle update path for task changes.
- Never interpolate task or review text into a shell command; launch the configured adapter as an executable plus argument array.
- Do not install packages, start authentication, or store credentials automatically. The optional explicit npx -y @agentclientprotocol/codex-acp command must be configured by the user.
- Keep raw ACP logs redacted and bounded to 4 MiB, and never write environment variables or authentication output to a run log.
- Add no dependency; use Go standard library, existing UUID/storage/search/lifecycle code, existing UI components, and Playwright.

---

## File map

- Modify internal/models/agent.go: add interrupted/session fields and snapshot adapter-state fields.
- Modify internal/storage/agent_store.go: persist session metadata and mark active work interrupted with an explicit resume phase.
- Modify internal/storage/agent_store_test.go: round-trip and restart-resume assertions.
- Modify internal/agents/codex/runner.go: replace Codex executable detection and JSONL runner helpers with codex-acp command detection, redacted logging, strict result decoding, and dirty-file checks.
- Create internal/agents/codex/acp.go: newline-delimited JSON-RPC transport, persistent adapter process, session lifecycle, update dispatch, permission replies, cancellation, and process shutdown.
- Modify internal/agents/codex/runner_test.go: adapter detection/result/logging tests.
- Create internal/agents/codex/acp_test.go: fake ACP stdio server tests for handshake, session lifecycle, permissions, updates, cancellation, and malformed protocol.
- Modify internal/agents/codex/workflow.go: task-session ownership, mode changes, Resume action, interrupted/disconnected handling, session close on completion, and progress events.
- Modify internal/agents/codex/workflow_test.go: persistent-session workflow, resume, ownership, and shutdown tests.
- Modify internal/server/routes/agent_test.go: Resume payload/action coverage and adapter status expectations.
- Modify internal/server/server.go: make shutdown close persistent adapter processes and preserve interrupted runs.
- Modify ui/src/models/agent.ts: add interrupted phase, Resume action, ACP session/adapter state, and updated setup fields.
- Modify ui/src/api/client.ts: keep existing agent endpoints and add typed resume/log refresh support.
- Modify ui/src/pages/ConfigPage.tsx: guide installation/authentication for codex-acp.
- Modify ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx: show session state, Resume, and live run-log refresh.
- Modify ui/e2e/codex-agent.spec.ts: update setup command fixtures and cover interrupted resume/live log behavior.

Each task below ends with a focused test run and a commit, so a failed later slice can be isolated without reverting unrelated work.

### Task 1: Persist ACP session and interruption state

**Files:**
- Modify: internal/models/agent.go
- Modify: internal/storage/agent_store.go
- Modify: internal/storage/agent_store_test.go

**Interfaces:**
- Produces models.AgentPhaseInterrupted, models.AgentWorkflow.CodexSessionID, models.AgentWorkflow.ResumePhase, and models.AgentRun.CodexSessionID.
- Produces models.AgentTaskSnapshot.AdapterState, Resumable, and Interrupted.
- Preserves AgentStore.Load, Save, TaskSnapshot, AcquireRunLock, and LogPath signatures.

- [ ] **Step 1: Write failing persistence tests.**

Seed a workflow with a session and an active implementation run, call MarkRunningInterrupted, and require durable interrupted/resume state:

~~~go
func TestAgentStoreMarksRunInterruptedAndKeepsSessionResumable(t *testing.T) {
	store := testAgentStore(t)
	now := time.Date(2026, 8, 19, 3, 0, 0, 0, time.UTC)
	err := store.Agent.Save(models.AgentState{
		Workflows: []models.AgentWorkflow{{
			ProjectID: store.ProjectID, TaskID: "task01",
			Phase: models.AgentPhaseImplementing, ActiveRunID: "run01",
			CodexSessionID: "session01",
		}},
		Runs: []models.AgentRun{{
			ID: "run01", ProjectID: store.ProjectID, TaskID: "task01",
			Phase: models.AgentRunPhaseImplementation,
			Status: models.AgentRunStatusRunning, CodexSessionID: "session01",
		}},
	})
	if err != nil { t.Fatal(err) }
	if err := store.Agent.MarkRunningInterrupted(now); err != nil { t.Fatal(err) }

	snapshot, err := store.Agent.TaskSnapshot("task01")
	if err != nil { t.Fatal(err) }
	if snapshot.Workflow.Phase != models.AgentPhaseInterrupted {
		t.Fatalf("phase = %q", snapshot.Workflow.Phase)
	}
	if snapshot.Workflow.ResumePhase != models.AgentRunPhaseImplementation {
		t.Fatalf("resume phase = %q", snapshot.Workflow.ResumePhase)
	}
	if snapshot.Workflow.CodexSessionID != "session01" || snapshot.Workflow.ActiveRunID != "" {
		t.Fatalf("workflow = %#v", snapshot.Workflow)
	}
	if snapshot.Runs[0].Status != models.AgentRunStatusInterrupted {
		t.Fatalf("run = %#v", snapshot.Runs[0])
	}
}
~~~

Add a JSON round-trip assertion for session IDs, ResumePhase, and empty slices. Run:

~~~bash
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/storage -run 'TestAgentStore' -count=1
~~~

Expected: FAIL because the new fields and interrupted phase do not exist yet.

- [ ] **Step 2: Add the model fields and phase constants.**

Use the existing JSON-tag convention with these fields:

~~~go
const AgentPhaseInterrupted AgentPhase = "interrupted"

type AgentWorkflow struct {
	ProjectID      string
	TaskID         string
	Phase          AgentPhase
	ActiveRunID    string
	CodexSessionID string
	ResumePhase    AgentRunPhase
	UpdatedAt      time.Time
}

type AgentRun struct {
	ID             string
	ProjectID      string
	TaskID         string
	Phase          AgentRunPhase
	Status         AgentRunStatus
	CodexSessionID string
	StartedAt      time.Time
	FinishedAt     *time.Time
	ExitCode       *int
	Summary        string
	Tests          []string
	Error          string
	LogPath        string
}

type AgentTaskSnapshot struct {
	Workflow       AgentWorkflow
	Runs           []AgentRun
	ReviewComments []ReviewComment
	DirtyFiles     []string
	AdapterState   string
	Resumable      bool
	Interrupted    bool
}
~~~

Apply the existing lower-camel JSON tags to the new fields. Do not add an adapter-process PID to persisted state; process handles are in memory and invalid after restart.

- [ ] **Step 3: Update restart recovery without changing normal failure restoration.**

In MarkRunningInterrupted, for each matching running run:

~~~go
run.Status = models.AgentRunStatusInterrupted
run.Error = "interrupted by server restart"
run.FinishedAt = &now
workflow.ActiveRunID = ""
workflow.Phase = models.AgentPhaseInterrupted
workflow.ResumePhase = run.Phase
workflow.UpdatedAt = now
~~~

Leave CodexSessionID intact. Keep project/task filtering and the existing state/run locks. TaskSnapshot returns AdapterState stopped, Resumable when a session and ResumePhase exist, and Interrupted when the workflow phase is interrupted; the manager will override adapter state when its process is alive.

- [ ] **Step 4: Run focused persistence tests and commit.**

~~~bash
gofmt -w internal/models/agent.go internal/storage/agent_store.go internal/storage/agent_store_test.go
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/storage -run 'TestAgentStore|TestNewProjectStore' -count=1
git add internal/models/agent.go internal/storage/agent_store.go internal/storage/agent_store_test.go
git commit -m "feat: persist ACP task sessions"
~~~

Expected: PASS, with only the persistence slice changed.

### Task 2: Implement the minimal ACP stdio client

**Files:**
- Create: internal/agents/codex/acp.go
- Modify: internal/agents/codex/runner.go
- Create: internal/agents/codex/acp_test.go
- Modify: internal/agents/codex/runner_test.go

**Interfaces:**
- Produces ACPUpdate with Kind and Text fields.
- Produces ACPMode values read-only and agent.
- Produces ACPProcess with NewACPProcess, NewSession, LoadSession, SetMode, Prompt, Cancel, Close, and SessionID methods.
- Produces Runner command/detection and strict result/logging helpers.

- [ ] **Step 1: Write failing fake-ACP tests.**

The fake server is an actual child process speaking one JSON object per line. It responds to initialize, session/new, session/load, session/set_mode, session/prompt, and session/close; it sends a session/request_permission request during one prompt and a session/update notification containing an agent_message_chunk before returning.

Add four concrete tests: session/new followed by two prompts and session/load must use one persisted session ID; a permission request offering allow_once and allow_always must receive the allow_always option ID; an agent_message_chunk must reach the update callback and its exact JSON text must decode into PhaseResult; malformed input and a cancelled stopReason must return errors without accepting a result.

Run:

~~~bash
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -run 'TestACP|TestDecode|TestValidate' -count=1
~~~

Expected: FAIL because the ACP process/client does not exist.

- [ ] **Step 2: Add newline-delimited JSON-RPC transport.**

Use exec.CommandContext(ctx, command[0], command[1:]...) with cmd.Dir set to the project root and stdin/stdout/stderr pipes. The transport must:

1. Write jsonrpc 2.0, monotonically increasing integer IDs, method, and params as one newline-terminated JSON object under a mutex.
2. Read stdout with a scanner capped at 4 MiB; log every raw line through the existing redacting bounded logger before dispatch.
3. Route response IDs to pending request channels and route agent requests/notifications without blocking the reader.
4. Respond to session/request_permission by choosing the first allow_always option, then allow_once, with an outcome selected response. Return outcome cancelled when no allowed option exists. Reply method-not-found for unsupported agent-to-client requests; do not advertise filesystem or terminal capabilities.
5. Fail all pending requests when stdout closes, the scanner reports malformed JSON, or the child exits.

Keep the transport protocol-only. It must not know task status, review comments, or UI concepts.

- [ ] **Step 3: Implement ACP initialization and session methods.**

Send these payloads:

~~~go
initialize := map[string]any{
	"protocolVersion": 1,
	"clientInfo": map[string]any{"name": "knowns", "title": "Know-Me", "version": "dev"},
	"clientCapabilities": map[string]any{
		"fs": map[string]any{"readTextFile": false, "writeTextFile": false},
		"terminal": false,
	},
}
newSession := map[string]any{"cwd": root, "mcpServers": []any{}}
loadSession := map[string]any{"sessionId": sessionID, "cwd": root, "mcpServers": []any{}}
setMode := map[string]any{"sessionId": sessionID, "modeId": string(mode)}
prompt := map[string]any{
	"sessionId": sessionID,
	"prompt": []any{map[string]any{"type": "text", "text": promptText}},
}
~~~

session/new stores the returned sessionId; session/load reuses the persisted ID after restart. session/set_mode accepts only read-only and agent. session/cancel is a notification, not a request. session/close is sent during task completion and process shutdown.

Collect only session/update agent_message_chunk text into the current prompt result. Treat session/prompt stopReason cancelled as cancellation and require a non-empty exact JSON object for every successful prompt. Do not strip Markdown fences or accept extra JSON values.

- [ ] **Step 4: Replace detection and result/log helpers.**

Default to the command array ["codex-acp"]. Read optional KNOWS_CODEX_ACP_COMMAND JSON such as ["npx","-y","@agentclientprotocol/codex-acp"]; reject an empty or malformed array and never execute through a shell. Detect resolves the first command element, runs its --version, reports npm install -g @agentclientprotocol/codex-acp, and uses codex login as authentication guidance. Authentication errors from session/new remain visible when a task starts.

Keep PhaseResult with the four required fields and additionalProperties false. Keep the existing 4 MiB redacted log ceiling and Git dirty-file parser. Update user-facing errors from Codex executable/JSONL to codex-acp adapter/ACP.

- [ ] **Step 5: Run ACP client tests and commit.**

~~~bash
gofmt -w internal/agents/codex/acp.go internal/agents/codex/runner.go internal/agents/codex/acp_test.go internal/agents/codex/runner_test.go
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -run 'TestACP|TestDecode|TestValidate|TestDirtyFiles|TestDetect' -count=1
git add internal/agents/codex/acp.go internal/agents/codex/acp_test.go internal/agents/codex/runner.go internal/agents/codex/runner_test.go
git commit -m "feat: add persistent ACP stdio client"
~~~

### Task 3: Move the workflow manager to one task session

**Files:**
- Modify: internal/agents/codex/workflow.go
- Modify: internal/agents/codex/workflow_test.go

**Interfaces:**
- Consumes ACPProcess from Task 2 and session fields from Task 1.
- Produces ActionResume and manager snapshots with adapter state, resumable, and interrupted populated.
- Preserves existing action names and task-status transitions.

- [ ] **Step 1: Write failing manager tests for session reuse and resume.**

Replace the old per-run fake setup with a fake session factory that records method calls. Assert one session ID is used for investigation, implementation, and fix prompts:

~~~go
func TestManagerReusesOneACPSessionAcrossReviewGates(t *testing.T) {
	manager, fake := testSessionManager(t, []PhaseResult{
		{ImplementationPlan: "plan", ImplementationNotes: "notes", Summary: "investigated", Tests: []string{}},
		{Summary: "implemented", Tests: []string{"go test ./..."}},
		{Summary: "fixed", Tests: []string{"go test ./..."}},
	})
	store := testAgentStore(t, "in-progress")
	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhasePlanReview)
	mustAct(t, manager, store, "task01", ActionApprovePlan, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
	mustAct(t, manager, store, "task01", ActionRequestImplementationChanges, "fix edge case")
	mustAct(t, manager, store, "task01", ActionStartFix, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
	if fake.SessionCount() != 1 || fake.PromptCount() != 3 { t.Fatalf("calls = %#v", fake) }
}

~~~

Add concrete tests: startup recovery must leave the workflow interrupted until ActionResume, which must call LoadSession; a transport disconnect must leave task status unchanged while persisting ResumePhase and the session ID; final implementation approval must call Close exactly once for the task session.

Preserve focused tests for dirty initial implementation, dirty fix allowance, blank comments, cross-process lock, stale completion, failure, cancellation, and cross-task log access. Run the package tests to verify the new tests fail against the one-shot manager.

- [ ] **Step 2: Add task-keyed in-memory session ownership.**

Key live sessions by project ID plus task ID. Keep active runs keyed by repository root for the project run lock. Store only live ACPProcess handles in memory. Add a session factory field in Manager so tests supply a fake session without adding a production provider:

~~~go
type sessionFactory func(context.Context, string, []string) (acpSession, error)

type activeSession struct {
	session acpSession
}
~~~

ensureSession uses the in-memory session when present; otherwise it launches codex-acp and calls session/new or session/load from persisted workflow state. Persist the returned session ID before sending the first prompt. If loading fails, retain the ID and mark the run interrupted with the error so the UI offers Resume again.

- [ ] **Step 3: Change execution to mode-switch and prompt on the persistent session.**

Map phases:

~~~go
func modeForPhase(phase models.AgentRunPhase) ACPMode {
	if phase == models.AgentRunPhaseInvestigation { return ACPModeReadOnly }
	return ACPModeAgent
}
~~~

startRunLocked still validates repository root, adapter status, project lock, clean initial implementation, and active-run ownership. It records the run first, starts a goroutine, obtains/reuses the task session, calls SetMode, then calls Prompt with the current task/review context. Load task/state immediately before the prompt so plan feedback is included. Hold the project AgentRunLock only for the active prompt; do not hold it across review gates.

Map every ACP update to the existing event shape. Emit a progress event for every update, using update text when present and update kind otherwise, so the UI can refresh the log while active. Save summary/tests and apply task changes only after strict result validation.

- [ ] **Step 4: Add Resume and interruption classification.**

Add:

~~~go
const ActionResume Action = "resume"
~~~

Resume is valid only for an interrupted workflow with a non-empty CodexSessionID and ResumePhase, no active run, and an in-progress task. It creates a new run with the saved ResumePhase, launches a new adapter process, calls session/load, restores the mode, and sends a continuation prompt. It never sends a prompt from snapshot or SSE read paths.

Classify explicit Cancel as cancelled. Classify process exit, reader failure, or ACP disconnect as interrupted with ResumePhase and session ID retained. Classify malformed protocol, authentication failure, malformed final JSON, and non-zero prompt errors as failed and restore the pre-run review phase without changing task status. Successful investigation moves to plan-review; successful implementation/fix moves to in-review.

- [ ] **Step 5: Close sessions safely and run manager tests.**

On final implementation approval, set task done and phase completed, then remove and close the task session. Manager.Close marks active runs interrupted before cancelling/closing processes so normal server shutdown is resumable; it does not remove completed historical session IDs. Ensure stale goroutines cannot apply results after cancellation/interruption.

~~~bash
gofmt -w internal/agents/codex/workflow.go internal/agents/codex/workflow_test.go
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -count=1
git add internal/agents/codex/workflow.go internal/agents/codex/workflow_test.go
git commit -m "feat: reuse ACP sessions across task gates"
~~~

### Task 4: Wire restart-safe manager state through HTTP/server lifecycle

**Files:**
- Modify: internal/server/routes/agent_test.go
- Modify: internal/server/server.go

**Interfaces:**
- Consumes ActionResume and manager snapshot fields from Task 3.
- Produces unchanged task-agent routing with a new resume action and shutdown-safe manager behavior.

- [ ] **Step 1: Add route tests for Resume and session state.**

Seed an interrupted workflow with CodexSessionID and ResumePhase, POST /tasks/task01/agent/resume, and assert 202 Accepted while the run is active. Add snapshot assertions for codexSessionId, resumable, interrupted, and adapterState. Update status fixtures to the codex-acp install command and GitHub adapter setup URL.

- [ ] **Step 2: Keep startup recovery and active-store routing correct.**

Retain store.Agent.MarkRunningInterrupted(time.Now().UTC()) during NewServer startup. Do not create an ACP process at startup. Resolve the current project store before every status/snapshot/action/log request; a session belongs to the task/project key, not the browser tab.

- [ ] **Step 3: Make server shutdown close processes without losing resumability.**

Keep s.codexManager.Close() after HTTP shutdown, with Manager.Close persisting interrupted state before terminating adapter processes. Do not add an HTTP daemon, background auto-resume, package installer, or permission endpoint. Keep SSE names agent:updated, agent:progress, and tasks:refresh unchanged.

- [ ] **Step 4: Run route/server checks and commit.**

~~~bash
gofmt -w internal/server/routes/agent_test.go internal/server/server.go
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/server/routes ./internal/server -run 'Agent|Server|Startup|Shutdown' -count=1
git add internal/server/routes/agent_test.go internal/server/server.go
git commit -m "feat: expose ACP resume state through server"
~~~

### Task 5: Update setup and task UI, including live logs

**Files:**
- Modify: ui/src/models/agent.ts
- Modify: ui/src/api/client.ts
- Modify: ui/src/pages/ConfigPage.tsx
- Modify: ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx
- Modify: ui/e2e/codex-agent.spec.ts

**Interfaces:**
- Consumes JSON fields from Task 1 and route behavior from Task 4.
- Produces existing task-panel controls plus explicit Resume and current ACP adapter/session state.

- [ ] **Step 1: Update TypeScript contracts and setup copy.**

Add interrupted to AgentPhase, resume to AgentAction, and fields matching Go:

~~~ts
export interface AgentWorkflow {
	projectId: string;
	taskId: string;
	phase: AgentPhase;
	activeRunId?: string;
	codexSessionId?: string;
	resumePhase?: AgentRunPhase;
	updatedAt: string;
}

export interface AgentTaskSnapshot {
	workflow: AgentWorkflow;
	runs: AgentRun[];
	reviewComments: ReviewComment[];
	dirtyFiles: string[];
	adapterState: "running" | "stopped";
	resumable: boolean;
	interrupted: boolean;
}
~~~

Change the Config AI card to say codex-acp, show npm installation/authentication guidance, and link to https://github.com/agentclientprotocol/codex-acp. Keep the no-auto-install/no-auto-login copy.

- [ ] **Step 2: Add Resume and live-log refresh behavior.**

In TaskAgentPanel:

1. Render Interrupted and session ID/adapter state when present.
2. Render Resume only for snapshot.interrupted and snapshot.resumable; call codexAgentApi.action(task.id, "resume").
3. Keep existing gate buttons and separate review-comment history unchanged.
4. Reset log state when the selected run changes. When the run-log details element is open, fetch the latest log on every agent:progress or agent:updated event for that task and once after completion. Pass event run ID to the fetch instead of relying on a stale latestRun closure.
5. Keep action/session/log errors visible.

Use a logOpen boolean plus a refreshLog(runID) callback with the existing SSE handler. Do not add a polling library or second event stream.

- [ ] **Step 3: Update browser tests.**

Use these setup fixtures:

~~~ts
installCommand: "npm install -g @agentclientprotocol/codex-acp",
loginCommand: "codex login",
docsUrl: "https://github.com/agentclientprotocol/codex-acp",
~~~

Extend the intercepted workflow test with an interrupted snapshot and Resume action. Keep plan feedback, implementation feedback, fix, final approval, and review-history assertions. Add a log route whose content changes from initial to updated; emit a mocked agent:progress event while details is open and assert updated is rendered.

- [ ] **Step 4: Run UI validation and commit.**

~~~bash
cd ui
bun run build
bunx playwright test e2e/codex-agent.spec.ts --project=chromium
cd ..
git add ui/src/models/agent.ts ui/src/api/client.ts ui/src/pages/ConfigPage.tsx ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx ui/e2e/codex-agent.spec.ts
git commit -m "feat: add ACP resume and live task logs"
~~~

### Task 6: Full verification and handoff

**Files:**
- If a verification command fails, modify only the specific source or test file identified by that failure.
- Test the focused Go/UI suites and repository validation commands below.

**Interfaces:**
- Consumes all completed ACP workflow slices.
- Produces a verified current-workspace implementation with no direct codex exec path.

- [ ] **Step 1: Run focused Go tests.**

~~~bash
GOCACHE=/tmp/knowns-agent-gocache go test ./internal/models ./internal/storage ./internal/agents/codex ./internal/server/routes ./internal/server -count=1
~~~

Expected: PASS, including fake ACP lifecycle, auto-permission, mode, cancellation, malformed protocol/final JSON, process exit, explicit resume, cross-process lock, and route tests.

- [ ] **Step 2: Scan for stale direct-runner behavior.**

~~~bash
rg -n "codex exec|output-schema|output-last-message|codexThreadId|JSONL event" internal ui docs/superpowers/plans/2026-08-19-codex-task-agent-orchestration.md
~~~

Expected: no production implementation references to the old runner.

- [ ] **Step 3: Run repository checks.**

~~~bash
go test ./...
cd ui && bun run build && cd ..
git diff --check
git status --short
~~~

Expected: PASS, clean formatting, and only intended ACP changes present.

- [ ] **Step 4: Commit verification fixes and report evidence.**

If a check exposes a real implementation defect, add the smallest regression test first, fix the shared path, rerun the failing command, then commit the focused fix. Final handoff must state exact commands and results; do not claim live Codex authentication was tested because the suite uses a fake ACP server.

## Plan self-review

- Spec coverage: session persistence, process reuse, mode switching, permission auto-approval, explicit restart resume, log/SSE streaming, setup guidance, task review loop, lock ownership, and failure behavior map to Tasks 1–5.
- Placeholder scan: no TODO, TBD, or unspecified implementation step is used; every code-facing step names a file, behavior, and command.
- Type consistency: AgentRunPhase is the persisted ResumePhase type; codexSessionId, adapterState, resumable, and interrupted are shared by Go/TypeScript; ActionResume is shared by route and panel.
- Scope check: no worktree, provider, automatic package install/login, direct App Server client, Node bridge, HTTP daemon, parallel queue, or per-permission UI is planned.
