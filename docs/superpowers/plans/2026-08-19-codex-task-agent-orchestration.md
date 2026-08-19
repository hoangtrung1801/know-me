# Codex Task Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, review-gated Codex workflow that investigates Know-Me tasks, implements approved plans in the current workspace, and repeats review/fix cycles until the user marks the task done.

**Architecture:** Persist project-scoped agent workflows, runs, and review comments in one global Know-Me JSON store. A small Go manager drives a local `codex exec` process, validates structured output, updates tasks through the existing lifecycle service, and broadcasts progress through the existing SSE broker; React surfaces setup status and task actions without introducing another global context.

**Tech Stack:** Go standard library, chi, existing Know-Me storage/task lifecycle/SSE code, React 19, TypeScript, existing UI components, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-codex-task-agent-orchestration-design.md`

## Global Constraints

- Support the locally installed Codex CLI only.
- Use `codex exec`; do not add Codex App Server or another agent provider.
- Investigation runs use `read-only`; implementation and fix runs use `workspace-write`.
- Never invoke `danger-full-access`.
- Task status edits never start Codex; every run begins from an explicit agent action.
- Run in the current registered project root; do not create worktrees or branches.
- Require a clean Git workspace before the first implementation run. Fix runs continue over the reviewed implementation changes and show the dirty-file list.
- Keep review comments separate from task implementation notes.
- Allow one active run per project root.
- Use argument arrays with `exec.CommandContext`; never interpolate task or review text into a shell command.
- Do not install Codex, start login, or store credentials automatically.
- Use the official setup URL `https://developers.openai.com/codex/cli`; on macOS/Linux the current official standalone install command is `curl -fsSL https://chatgpt.com/codex/install.sh | sh`.
- Add no dependency: reuse the Go standard library, the existing `github.com/google/uuid` module, existing React components, and Playwright.

## File map

- Create `internal/models/agent.go`: shared persisted agent phases, runs, review comments, and task snapshot types.
- Create `internal/storage/agent_store.go`: atomic `.knowns/agent-workflows.json` persistence, project filtering, log-path resolution, and restart interruption.
- Modify `internal/storage/store.go`: expose `Store.Agent` and initialize the agent store.
- Create `internal/storage/agent_store_test.go`: project scoping, round-trip, and interrupted-run coverage.
- Create `internal/agents/codex/runner.go`: Codex detection, command construction, Git dirty-file check, JSONL parsing, structured output, and raw logging.
- Create `internal/agents/codex/runner_test.go`: fake-process tests for status, sandbox arguments, event parsing, and invalid output.
- Create `internal/agents/codex/workflow.go`: action validation, prompts, asynchronous run ownership, task updates, comments, cancellation, and snapshots.
- Create `internal/agents/codex/workflow_test.go`: the investigation/approval/review/fix state machine and failure recovery.
- Create `internal/server/routes/agent.go`: Codex status, task snapshot, action, and run-log HTTP handlers.
- Create `internal/server/routes/agent_test.go`: route status codes, payloads, and SSE-facing manager events.
- Modify `internal/server/server.go`: own one Codex workflow manager, register routes, interrupt stale runs at startup, and cancel children on shutdown.
- Create `ui/src/models/agent.ts`: frontend agent contracts.
- Modify `ui/src/api/client.ts`: Codex status, snapshot, action, and log methods.
- Modify `ui/src/contexts/SSEContext.tsx`: typed `agent:updated` and `agent:progress` events.
- Modify `ui/src/pages/ConfigPage.tsx`: Codex setup/status card in the existing AI section.
- Create `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`: task phase, actions, progress, comments, run result, dirty files, and log UI.
- Modify `ui/src/components/organisms/TaskDetail/TaskDetailSheet.tsx`: mount the agent panel beside the existing plan and notes.
- Modify `ui/src/components/organisms/TaskDetail/index.ts`: export the panel.
- Create `ui/e2e/codex-agent.spec.ts`: setup card and review-loop UI coverage with intercepted agent APIs.

---

### Task 1: Persist project-scoped agent state

**Files:**
- Create: `internal/models/agent.go`
- Create: `internal/storage/agent_store.go`
- Create: `internal/storage/agent_store_test.go`
- Modify: `internal/storage/store.go`

**Interfaces:**
- Produces: `models.AgentPhase`, `models.AgentRunPhase`, `models.AgentRunStatus`, `models.AgentWorkflow`, `models.AgentRun`, `models.ReviewComment`, `models.AgentState`, and `models.AgentTaskSnapshot`.
- Produces: `AgentStore.Load()`, `AgentStore.Save(models.AgentState)`, `AgentStore.TaskSnapshot(taskID)`, `AgentStore.MarkRunningInterrupted(time.Time)`, and `AgentStore.LogPath(runID)`.
- Consumes: existing package-private `storage.writeJSON`, `storage.readJSON`, `storage.Store.Root`, and `storage.Store.ProjectID`.

- [ ] **Step 1: Write failing storage tests**

```go
func TestAgentStoreScopesDuplicateTaskIDsByProject(t *testing.T) {
	root := t.TempDir()
	alpha := NewProjectStore(root, "alpha", t.TempDir())
	beta := NewProjectStore(root, "beta", t.TempDir())

	state := models.AgentState{Workflows: []models.AgentWorkflow{
		{ProjectID: "alpha", TaskID: "same01", Phase: models.AgentPhasePlanReview},
		{ProjectID: "beta", TaskID: "same01", Phase: models.AgentPhaseFixReady},
	}}
	if err := alpha.Agent.Save(state); err != nil { t.Fatal(err) }

	a, err := alpha.Agent.TaskSnapshot("same01")
	if err != nil { t.Fatal(err) }
	b, err := beta.Agent.TaskSnapshot("same01")
	if err != nil { t.Fatal(err) }
	if a.Workflow.Phase != models.AgentPhasePlanReview { t.Fatalf("alpha phase = %q", a.Workflow.Phase) }
	if b.Workflow.Phase != models.AgentPhaseFixReady { t.Fatalf("beta phase = %q", b.Workflow.Phase) }
}

func TestAgentStoreMarksRunningRunsInterrupted(t *testing.T) {
	store := NewProjectStore(t.TempDir(), "alpha", t.TempDir())
	started := time.Date(2026, 8, 19, 2, 0, 0, 0, time.UTC)
	finished := started.Add(time.Minute)
	state := models.AgentState{
		Workflows: []models.AgentWorkflow{{ProjectID: "alpha", TaskID: "task01", Phase: models.AgentPhaseImplementing, ActiveRunID: "run01"}},
		Runs: []models.AgentRun{{ID: "run01", ProjectID: "alpha", TaskID: "task01", Phase: models.AgentRunPhaseImplementation, Status: models.AgentRunStatusRunning, StartedAt: started}},
	}
	if err := store.Agent.Save(state); err != nil { t.Fatal(err) }
	if err := store.Agent.MarkRunningInterrupted(finished); err != nil { t.Fatal(err) }

	snapshot, err := store.Agent.TaskSnapshot("task01")
	if err != nil { t.Fatal(err) }
	if snapshot.Workflow.ActiveRunID != "" || snapshot.Workflow.Phase != models.AgentPhasePlanReview { t.Fatalf("workflow = %#v", snapshot.Workflow) }
	if snapshot.Runs[0].Status != models.AgentRunStatusInterrupted { t.Fatalf("run = %#v", snapshot.Runs[0]) }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/storage -run 'TestAgentStore' -count=1`

Expected: FAIL because `Store.Agent` and the agent model types do not exist.

- [ ] **Step 3: Add the model and minimum atomic store**

```go
type AgentPhase string
type AgentRunPhase string
type AgentRunStatus string
type ReviewStage string

const (
	AgentPhaseIdle          AgentPhase = "idle"
	AgentPhaseInvestigating AgentPhase = "investigating"
	AgentPhasePlanReview    AgentPhase = "plan-review"
	AgentPhaseImplementing  AgentPhase = "implementing"
	AgentPhaseCodeReview    AgentPhase = "code-review"
	AgentPhaseFixReady      AgentPhase = "fix-ready"
	AgentPhaseCompleted     AgentPhase = "completed"

	AgentRunPhaseInvestigation  AgentRunPhase = "investigation"
	AgentRunPhaseImplementation AgentRunPhase = "implementation"
	AgentRunPhaseFix            AgentRunPhase = "fix"

	AgentRunStatusRunning     AgentRunStatus = "running"
	AgentRunStatusSucceeded   AgentRunStatus = "succeeded"
	AgentRunStatusFailed      AgentRunStatus = "failed"
	AgentRunStatusCancelled   AgentRunStatus = "cancelled"
	AgentRunStatusInterrupted AgentRunStatus = "interrupted"

	ReviewStagePlan           ReviewStage = "plan"
	ReviewStageImplementation ReviewStage = "implementation"
)

type AgentWorkflow struct {
	ProjectID  string     `json:"projectId"`
	TaskID     string     `json:"taskId"`
	Phase      AgentPhase `json:"phase"`
	ActiveRunID string    `json:"activeRunId,omitempty"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

type AgentRun struct {
	ID            string         `json:"id"`
	ProjectID     string         `json:"projectId"`
	TaskID        string         `json:"taskId"`
	Phase         AgentRunPhase  `json:"phase"`
	Status        AgentRunStatus `json:"status"`
	CodexThreadID string         `json:"codexThreadId,omitempty"`
	StartedAt     time.Time      `json:"startedAt"`
	FinishedAt    *time.Time     `json:"finishedAt,omitempty"`
	ExitCode      *int           `json:"exitCode,omitempty"`
	Summary       string         `json:"summary,omitempty"`
	Tests         []string       `json:"tests,omitempty"`
	Error         string         `json:"error,omitempty"`
	LogPath       string         `json:"logPath"`
}

type ReviewComment struct {
	ID        string      `json:"id"`
	ProjectID string      `json:"projectId"`
	TaskID    string      `json:"taskId"`
	Stage     ReviewStage `json:"stage"`
	Body      string      `json:"body"`
	CreatedAt time.Time   `json:"createdAt"`
	RunID     string      `json:"runId,omitempty"`
}

type AgentState struct {
	Workflows      []AgentWorkflow `json:"workflows"`
	Runs           []AgentRun      `json:"runs"`
	ReviewComments []ReviewComment `json:"reviewComments"`
}

type AgentTaskSnapshot struct {
	Workflow       AgentWorkflow   `json:"workflow"`
	Runs           []AgentRun      `json:"runs"`
	ReviewComments []ReviewComment `json:"reviewComments"`
	DirtyFiles     []string        `json:"dirtyFiles"`
}
```

Implement `AgentStore.filePath()` as `<store root>/agent-workflows.json`. Every record carries `ProjectID`; `TaskSnapshot` filters on both `AgentStore.projectID` and `taskID`, sorts runs/comments oldest-first, and returns an in-memory `idle` workflow when none exists. `MarkRunningInterrupted` changes only records matching `AgentStore.projectID` and restores the workflow phase from the run phase (`investigation` to `idle`, `implementation` to `plan-review`, `fix` to `fix-ready`). `Save` uses `writeJSON`, and a missing file loads as empty non-nil slices.

```go
type AgentStore struct {
	root      string
	projectID string
}

func (as *AgentStore) LogPath(runID string) string {
	return filepath.Join(as.root, "runtime", "codex", as.projectID, filepath.Base(runID)+".jsonl")
}
```

Add `Agent *AgentStore` to `storage.Store` and initialize it in `newStore`.

- [ ] **Step 4: Run storage tests**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/storage -run 'TestAgentStore|TestNewProjectStore' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the persistence slice**

```bash
git add internal/models/agent.go internal/storage/agent_store.go internal/storage/agent_store_test.go internal/storage/store.go
git commit -m "feat: persist Codex task agent state"
```

---

### Task 2: Detect and run the Codex CLI safely

**Files:**
- Create: `internal/agents/codex/runner.go`
- Create: `internal/agents/codex/runner_test.go`

**Interfaces:**
- Consumes: `models.AgentRunPhase` and `AgentStore.LogPath` output.
- Produces: `Detect(context.Context, string) Status`.
- Produces: `Runner.BuildArgs(Request) []string` and `Runner.Run(context.Context, Request, func(StreamEvent)) (Result, error)`.
- Produces: `DirtyFiles(context.Context, string) ([]string, error)`.

- [ ] **Step 1: Write failing command and parser tests**

```go
func TestBuildArgsUsesLeastPrivilegeSandbox(t *testing.T) {
	runner := Runner{Executable: "codex"}
	readArgs := strings.Join(runner.BuildArgs(Request{Root: "/repo", Phase: models.AgentRunPhaseInvestigation, SchemaPath: "/tmp/schema.json", ResultPath: "/tmp/result.json", Prompt: "inspect"}), " ")
	writeArgs := strings.Join(runner.BuildArgs(Request{Root: "/repo", Phase: models.AgentRunPhaseImplementation, SchemaPath: "/tmp/schema.json", ResultPath: "/tmp/result.json", Prompt: "implement"}), " ")

	if !strings.Contains(readArgs, "--sandbox read-only") { t.Fatalf("read args = %s", readArgs) }
	if !strings.Contains(writeArgs, "--sandbox workspace-write") { t.Fatalf("write args = %s", writeArgs) }
	if strings.Contains(readArgs+writeArgs, "danger-full-access") { t.Fatal("unsafe sandbox present") }
}

func TestParseStreamEventCapturesThreadAndMessage(t *testing.T) {
	event, err := parseStreamEvent([]byte(`{"type":"thread.started","thread_id":"thread-1"}`))
	if err != nil || event.ThreadID != "thread-1" { t.Fatalf("event = %#v, err = %v", event, err) }
	event, err = parseStreamEvent([]byte(`{"type":"item.completed","item":{"type":"agent_message","text":"done"}}`))
	if err != nil || event.Message != "done" { t.Fatalf("event = %#v, err = %v", event, err) }
}

func TestValidateResultRequiresInvestigationPlan(t *testing.T) {
	err := validateResult(models.AgentRunPhaseInvestigation, PhaseResult{Summary: "looked"})
	if err == nil || !strings.Contains(err.Error(), "implementationPlan") { t.Fatalf("err = %v", err) }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -run 'TestBuildArgs|TestParseStreamEvent|TestValidateResult' -count=1`

Expected: FAIL because the Codex runner package does not exist.

- [ ] **Step 3: Implement detection and command construction**

```go
type Status struct {
	Installed      bool   `json:"installed"`
	LoggedIn       bool   `json:"loggedIn"`
	Version        string `json:"version,omitempty"`
	Error          string `json:"error,omitempty"`
	InstallCommand string `json:"installCommand,omitempty"`
	LoginCommand   string `json:"loginCommand"`
	DocsURL        string `json:"docsUrl"`
}

type Request struct {
	Root, Prompt, SchemaPath, ResultPath, LogPath string
	Phase models.AgentRunPhase
}

func (r Runner) BuildArgs(req Request) []string {
	sandbox := "read-only"
	if req.Phase != models.AgentRunPhaseInvestigation { sandbox = "workspace-write" }
	return []string{"exec", "--json", "--cd", req.Root, "--sandbox", sandbox, "--output-schema", req.SchemaPath, "--output-last-message", req.ResultPath, req.Prompt}
}
```

`Detect` resolves `codex` with `exec.LookPath`, runs `--version`, then runs `login status` with a short context timeout. Discard login command output and return only a boolean/generic error. Set `InstallCommand` only on macOS/Linux; set `LoginCommand` to `codex` because the official quickstart signs in on first launch.

- [ ] **Step 4: Implement JSONL execution and structured result validation**

Use `exec.CommandContext` directly with `BuildArgs`. Create the log directory, write stdout JSONL lines and stderr to the run log, use a scanner buffer large enough for a 4 MiB event, parse `thread.started` and item messages for progress, then read the final JSON from `ResultPath`.

```go
type PhaseResult struct {
	ImplementationPlan  string   `json:"implementationPlan"`
	ImplementationNotes string   `json:"implementationNotes"`
	Summary             string   `json:"summary"`
	Tests               []string `json:"tests"`
}

type Result struct {
	ThreadID string
	ExitCode int
	Output   PhaseResult
}
```

Embed one strict JSON schema with all four fields required and `additionalProperties: false`; plan/notes may be empty on implementation/fix runs, while `validateResult` requires a non-empty plan for investigation and a non-empty summary for every phase. Never add auth values or the child environment to the log.

- [ ] **Step 5: Add fake-process and Git dirty-file tests**

Use the Go test binary as the child process by setting `Runner.Executable = os.Args[0]` and a test-only environment marker. The helper emits a `thread.started` JSONL line and writes schema-conforming JSON to the path following `--output-last-message`.

```go
func TestRunnerReadsStructuredOutputWithoutLiveCodex(t *testing.T) {
	result, err := testRunner(t).Run(context.Background(), testRequest(t, models.AgentRunPhaseInvestigation), nil)
	if err != nil { t.Fatal(err) }
	if result.ThreadID != "thread-test" || result.Output.ImplementationPlan != "1. Change code" { t.Fatalf("result = %#v", result) }
}
```

Create a temporary Git repository, commit one file, modify it, and assert `DirtyFiles` returns that file. Use `git -C <root> status --porcelain` through `exec.CommandContext`, never a shell.

- [ ] **Step 6: Run runner tests**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -run 'TestBuildArgs|TestParseStreamEvent|TestValidateResult|TestRunner|TestDirtyFiles' -count=1`

Expected: PASS without invoking an installed Codex account.

- [ ] **Step 7: Commit the runner**

```bash
git add internal/agents/codex/runner.go internal/agents/codex/runner_test.go
git commit -m "feat: add safe Codex CLI runner"
```

---

### Task 3: Implement the task workflow manager

**Files:**
- Create: `internal/agents/codex/workflow.go`
- Create: `internal/agents/codex/workflow_test.go`

**Interfaces:**
- Consumes: `Runner.Run`, `Detect`, `DirtyFiles`, `Store.Agent`, `Store.Tasks`, and `tasklifecycle.Service.UpdateTask`.
- Produces: `NewManager(executable string, emit func(Event)) *Manager`.
- Produces: `Manager.Status`, `Manager.Snapshot`, `Manager.Act`, `Manager.ReadLog`, and `Manager.Close`.
- Produces: action constants `start-investigation`, `approve-plan`, `request-plan-changes`, `approve-implementation`, `request-implementation-changes`, `start-fix`, and `cancel`.

- [ ] **Step 1: Write failing state-machine tests**

```go
func TestManagerRunsInvestigationImplementationAndReviewLoop(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, []PhaseResult{
		{ImplementationPlan: "1. Implement", ImplementationNotes: "Investigated", Summary: "planned", Tests: []string{}},
		{Summary: "implemented", Tests: []string{"go test ./..."}},
		{Summary: "fixed review", Tests: []string{"go test ./..."}},
	})

	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhasePlanReview)
	mustAct(t, manager, store, "task01", ActionApprovePlan, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)

	mustAct(t, manager, store, "task01", ActionRequestImplementationChanges, "handle the edge case")
	snapshot := mustSnapshot(t, manager, store, "task01")
	if snapshot.Workflow.Phase != models.AgentPhaseFixReady || len(snapshot.ReviewComments) != 1 { t.Fatalf("snapshot = %#v", snapshot) }

	mustAct(t, manager, store, "task01", ActionStartFix, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
	mustAct(t, manager, store, "task01", ActionApproveImplementation, "")
	if task, _ := store.Tasks.Get("task01"); task.Status != "done" { t.Fatalf("status = %q", task.Status) }
}

func TestManagerRequiresCleanInitialImplementationButAllowsDirtyFix(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, []PhaseResult{{Summary: "fixed", Tests: []string{"go test ./..."}}})
	manager.dirtyFiles = func(context.Context, string) ([]string, error) {
		return []string{"internal/example.go"}, nil
	}
	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhasePlanReview,
	})

	_, _, err := manager.Act(context.Background(), store, "task01", ActionApprovePlan, "")
	if !errors.Is(err, ErrConflict) { t.Fatalf("approve-plan err = %v", err) }
	if phase := mustSnapshot(t, manager, store, "task01").Workflow.Phase; phase != models.AgentPhasePlanReview {
		t.Fatalf("phase after rejected implementation = %q", phase)
	}

	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhaseFixReady,
	})
	mustAct(t, manager, store, "task01", ActionStartFix, "")
	if files := mustSnapshot(t, manager, store, "task01").DirtyFiles; !slices.Equal(files, []string{"internal/example.go"}) {
		t.Fatalf("dirty files = %#v", files)
	}
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -run 'TestManager' -count=1`

Expected: FAIL because `Manager` and its actions do not exist.

- [ ] **Step 3: Implement synchronous review actions and snapshots**

```go
type Action string

const (
	ActionStartInvestigation             Action = "start-investigation"
	ActionApprovePlan                    Action = "approve-plan"
	ActionRequestPlanChanges             Action = "request-plan-changes"
	ActionApproveImplementation          Action = "approve-implementation"
	ActionRequestImplementationChanges  Action = "request-implementation-changes"
	ActionStartFix                       Action = "start-fix"
	ActionCancel                         Action = "cancel"
)

var (
	ErrInvalid  = errors.New("invalid agent action")
	ErrConflict = errors.New("agent action conflict")
)

type Event struct {
	Type        string `json:"type"`
	ProjectID   string `json:"projectId"`
	TaskID      string `json:"taskId"`
	RunID       string `json:"runId,omitempty"`
	Message     string `json:"message,omitempty"`
	TaskChanged bool   `json:"taskChanged,omitempty"`
}

func (m *Manager) Status(ctx context.Context, store *storage.Store) Status
func (m *Manager) Snapshot(ctx context.Context, store *storage.Store, taskID string) (models.AgentTaskSnapshot, error)
func (m *Manager) Act(ctx context.Context, store *storage.Store, taskID string, action Action, comment string) (models.AgentTaskSnapshot, bool, error)
func (m *Manager) ReadLog(store *storage.Store, taskID, runID string) (string, error)
func (m *Manager) Close()
```

The `bool` returned by `Act` is true only when the action started an asynchronous Codex child; routes use it to choose `202` versus `200`.

`Snapshot` loads the project/task records under the manager mutex and adds `DirtyFiles`. Review-change actions require non-empty trimmed comments. Plan feedback appends a `plan` comment and returns to `idle`; implementation feedback appends an `implementation` comment, updates the task to `in-progress`, and moves to `fix-ready`; final approval updates the task to `done` and phase to `completed`.

All task mutations call `tasklifecycle.New(store, tasklifecycle.WithHooks(...)).UpdateTask` with actor `codex-agent`, preserving lifecycle clocks, task version history, and search indexing.

- [ ] **Step 4: Implement asynchronous run ownership**

`Manager.Act` validates the task status and phase, checks Codex status, stores a running `AgentRun`, sets `ActiveRunID`, creates a background context, and launches one goroutine. The HTTP request context must not own the child lifetime.

```go
type Manager struct {
	mu        sync.Mutex
	executable string
	active    map[string]context.CancelFunc
	emit      func(Event)
	run       func(context.Context, Request, func(StreamEvent)) (Result, error)
	detect    func(context.Context, string) Status
	dirtyFiles func(context.Context, string) ([]string, error)
	now       func() time.Time
}
```

Key `active` by `store.RepositoryRoot()`. Mark the deliberate version-one limit in code:

```go
// ponytail: one process per project root; add a queue only when concurrent task demand is real.
```

On success:

- Investigation saves `ImplementationPlan` and `ImplementationNotes`, clears `ActiveRunID`, and moves to `plan-review`.
- Implementation/fix saves the run summary/tests, updates task status to `in-review`, clears `ActiveRunID`, and moves to `code-review`.

On failure/cancel:

- Set run status to `failed` or `cancelled`, save exit/error details, clear `ActiveRunID`, and restore the actionable source phase: `idle`, `plan-review`, or `fix-ready`.
- Never advance task status.

- [ ] **Step 5: Build exact phase prompts**

Use `strings.Builder` and pass the completed prompt as one argument. Include task title, description, acceptance criteria, plan, notes, and only review comments for the relevant stage. End every prompt with these boundaries:

```text
Do not edit Know-Me task or document metadata directly.
Do not change files outside the current project workspace.
Return only the structured result required by the provided JSON schema.
```

Investigation adds `Inspect only; do not modify project files.` Implementation adds `Implement the approved plan and run relevant tests.` Fix adds `Continue from the existing reviewed workspace changes and address every supplied review comment.`

- [ ] **Step 6: Complete manager tests**

Use a table for the non-running validation cases:

```go
func TestManagerRejectsInvalidReviewActionsWithoutMutation(t *testing.T) {
	tests := []struct {
		name    string
		phase   models.AgentPhase
		action  Action
		comment string
		wantErr error
	}{
		{"wrong phase", models.AgentPhaseIdle, ActionApproveImplementation, "", ErrConflict},
		{"blank plan comment", models.AgentPhasePlanReview, ActionRequestPlanChanges, " ", ErrInvalid},
		{"blank implementation comment", models.AgentPhaseCodeReview, ActionRequestImplementationChanges, "\n", ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testAgentStore(t, "in-progress")
			manager := testManager(t, nil)
			seedAgentWorkflow(t, store, models.AgentWorkflow{ProjectID: store.ProjectID, TaskID: "task01", Phase: tt.phase})
			before := mustSnapshot(t, manager, store, "task01")
			_, _, err := manager.Act(context.Background(), store, "task01", tt.action, tt.comment)
			if !errors.Is(err, tt.wantErr) { t.Fatalf("err = %v, want %v", err, tt.wantErr) }
			after := mustSnapshot(t, manager, store, "task01")
			if !reflect.DeepEqual(before, after) { t.Fatalf("state mutated: before=%#v after=%#v", before, after) }
		})
	}
}
```

Add `TestManagerSerializesRunsPerProjectRoot` with two stores sharing one repository root: block the first fake `run` on a channel, assert the second start returns `ErrConflict`, release the channel, and wait for completion. Add table-driven fake-run failures for investigation and implementation and assert the restored phase/task status. Add a blocking fake run, call `cancel`, and assert the run status is `cancelled`. Finally, save runs for two task IDs, write only through `store.Agent.LogPath`, and assert `ReadLog` serves the matching task and returns `ErrConflict` for the other.

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/agents/codex -count=1`

Expected: PASS.

- [ ] **Step 7: Commit the workflow manager**

```bash
git add internal/agents/codex/workflow.go internal/agents/codex/workflow_test.go
git commit -m "feat: orchestrate Codex task workflow"
```

---

### Task 4: Expose the workflow through HTTP and server lifecycle

**Files:**
- Create: `internal/server/routes/agent.go`
- Create: `internal/server/routes/agent_test.go`
- Modify: `internal/server/server.go`

**Interfaces:**
- Consumes: `codex.Manager` and `storage.Manager`.
- Produces: `NewAgentRoutes(store *storage.Store, mgr *storage.Manager, agent *codex.Manager) *AgentRoutes`.
- Produces: `GET /api/codex/status`.
- Produces: `GET /api/tasks/{id}/agent`.
- Produces: `POST /api/tasks/{id}/agent/{action}` with `{ "comment": "..." }`.
- Produces: `GET /api/tasks/{id}/agent/runs/{runID}/log`.
- Produces: SSE event types `agent:updated` and `agent:progress`.

- [ ] **Step 1: Write failing route tests**

```go
func TestAgentRoutesRejectBlankReviewComment(t *testing.T) {
	router, store, _ := setupAgentRoutes(t)
	seedAgentTask(t, store, models.AgentPhaseCodeReview, "in-review")
	req := httptest.NewRequest(http.MethodPost, "/tasks/task01/agent/request-implementation-changes", strings.NewReader(`{"comment":" "}`))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest { t.Fatalf("status = %d body = %s", w.Code, w.Body.String()) }
}

func TestAgentRoutesReturnSnapshotAndLog(t *testing.T) {
	router, store, _ := setupAgentRoutes(t)
	seedCompletedAgentRun(t, store, "task01", "run01", "log line\n")
	for _, path := range []string{"/tasks/task01/agent", "/tasks/task01/agent/runs/run01/log"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK { t.Fatalf("%s status = %d body = %s", path, w.Code, w.Body.String()) }
	}
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/server/routes -run 'TestAgentRoutes' -count=1`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement the route contract**

```go
type AgentRoutes struct {
	store *storage.Store
	mgr   *storage.Manager
	agent *codex.Manager
}

func (ar *AgentRoutes) Register(r chi.Router) {
	r.Get("/codex/status", ar.status)
	r.Get("/tasks/{id}/agent", ar.snapshot)
	r.Post("/tasks/{id}/agent/{action}", ar.action)
	r.Get("/tasks/{id}/agent/runs/{runID}/log", ar.log)
}
```

Return `400` for malformed JSON, unknown actions, and missing required comments; `404` for missing task/run; `409` for phase, workspace, Codex, or active-run conflicts; `500` for storage/process setup failures. Return `202` for actions that start a child and `200` for synchronous review actions. The log response is `{ "content": "..." }`; never accept a filesystem path from the client.

- [ ] **Step 4: Wire one manager into the server**

Add `codexManager *codex.Manager` to `Server`. Construct it after `s.sse` exists:

```go
s.codexManager = codex.NewManager("", func(event codex.Event) {
	eventType := "agent:updated"
	if event.Type == "progress" { eventType = "agent:progress" }
	s.sse.Broadcast(routes.SSEEvent{Type: eventType, Data: event})
	if event.TaskChanged {
		s.sse.Broadcast(routes.SSEEvent{Type: "tasks:refresh", Data: map[string]any{}})
	}
})
```

At startup call `store.Agent.MarkRunningInterrupted(time.Now().UTC())`. In `buildRouter`, register `routes.NewAgentRoutes(s.store, s.manager, s.codexManager)` inside the existing `/api` route. During graceful shutdown call `s.codexManager.Close()` before cleaning up the OpenCode server.

- [ ] **Step 5: Run route and server tests**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/server/routes ./internal/server -run 'TestAgent|TestServer' -count=1`

Expected: PASS and no live Codex invocation.

- [ ] **Step 6: Commit the HTTP slice**

```bash
git add internal/server/routes/agent.go internal/server/routes/agent_test.go internal/server/server.go
git commit -m "feat: expose Codex task agent API"
```

---

### Task 5: Add frontend contracts and Codex setup status

**Files:**
- Create: `ui/src/models/agent.ts`
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/contexts/SSEContext.tsx`
- Modify: `ui/src/pages/ConfigPage.tsx`
- Create: `ui/e2e/codex-agent.spec.ts`

**Interfaces:**
- Consumes: the Task 4 HTTP/SSE contracts.
- Produces: `codexAgentApi.status`, `codexAgentApi.snapshot`, `codexAgentApi.action`, and `codexAgentApi.log`.
- Produces: typed frontend `AgentTaskSnapshot` and `CodexStatus`.

- [ ] **Step 1: Write the failing setup-card E2E test**

```ts
test("guides setup when Codex is missing", async ({ page }) => {
	await page.route("**/api/codex/status", route => route.fulfill({
		json: {
			installed: false,
			loggedIn: false,
			installCommand: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
			loginCommand: "codex",
			docsUrl: "https://developers.openai.com/codex/cli",
		},
	}));
	await page.goto(`${server.baseURL}/config`);
	await page.getByRole("tab", { name: "AI" }).click();
	await expect(page.getByRole("heading", { name: "Codex" })).toBeVisible();
	await expect(page.getByText("Codex is not installed")).toBeVisible();
	await expect(page.getByText("curl -fsSL", { exact: false })).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test and confirm it fails**

Run: `cd ui && bun test:e2e -- codex-agent.spec.ts --grep 'guides setup'`

Expected: FAIL because the Codex setup card is absent.

- [ ] **Step 3: Add TypeScript contracts and API methods**

```ts
export type AgentPhase = "idle" | "investigating" | "plan-review" | "implementing" | "code-review" | "fix-ready" | "completed";
export type AgentAction = "start-investigation" | "approve-plan" | "request-plan-changes" | "approve-implementation" | "request-implementation-changes" | "start-fix" | "cancel";

export interface AgentTaskSnapshot {
	workflow: AgentWorkflow;
	runs: AgentRun[];
	reviewComments: ReviewComment[];
	dirtyFiles: string[];
}
```

Add `codexAgentApi` methods using `apiFetch`, URL-encode IDs/actions, parse JSON error bodies, and throw the backend message. Keep timestamps as ISO strings; the panel can format them at render time.

- [ ] **Step 4: Add typed SSE events**

Extend `SSEEventType` and `SSEEventPayloads` with:

```ts
| "agent:updated"
| "agent:progress"

"agent:updated": AgentEvent;
"agent:progress": AgentEvent;
```

Register both named event listeners and emit parsed payloads. Do not add another EventSource or provider.

- [ ] **Step 5: Add the Codex card to the existing AI settings section**

Load status when ConfigPage mounts and on Refresh. Render Codex before OpenCode using existing `SectionHeader`, `FieldRow`, `Button`, status colors, `Loader2`, `CheckCircle2`, `AlertCircle`, and `Copy`.

```tsx
<SectionHeader icon={Bot} title="Codex" description="Local coding agent used by task workflows" />
<FieldRow label="Connection" hint="Know-Me detects Codex but never installs it or changes credentials">
	<div className="space-y-3">
		<div className="flex items-center gap-2">
			{status?.installed && status.loggedIn ? <CheckCircle2 className="text-green-500" /> : <AlertCircle className="text-amber-500" />}
			<span>{status?.installed ? (status.loggedIn ? "Codex connected" : "Codex needs sign-in") : "Codex is not installed"}</span>
			{status?.version && <span className="text-muted-foreground">{status.version}</span>}
		</div>
		{command && (
			<div className="flex items-center gap-2">
				<code className="break-all">{command}</code>
				<Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(command)} aria-label="Copy Codex command"><Copy /></Button>
			</div>
		)}
		<div className="flex gap-2">
			<Button variant="outline" onClick={loadCodexStatus} disabled={loading}>{loading && <Loader2 className="animate-spin" />}Refresh</Button>
			<a href={status?.docsUrl} target="_blank" rel="noreferrer">Setup guide</a>
		</div>
	</div>
</FieldRow>
<Separator className="my-6" />
```

Derive `command` as `status?.installed ? status?.loginCommand : status?.installCommand`. Use the exact messages `Codex connected`, `Codex is not installed`, and `Codex needs sign-in`. If status loading fails, show the returned message inline and keep Refresh available. Copy only the returned command; never execute it.

- [ ] **Step 6: Verify setup UI**

Run: `cd ui && bunx tsc --noEmit && bun run build && bun test:e2e -- codex-agent.spec.ts --grep 'guides setup'`

Expected: PASS.

- [ ] **Step 7: Commit setup UI**

```bash
git add ui/src/models/agent.ts ui/src/api/client.ts ui/src/contexts/SSEContext.tsx ui/src/pages/ConfigPage.tsx ui/e2e/codex-agent.spec.ts
git commit -m "feat: show Codex setup status"
```

---

### Task 6: Add the task review and fix-loop UI

**Files:**
- Create: `ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx`
- Modify: `ui/src/components/organisms/TaskDetail/TaskDetailSheet.tsx`
- Modify: `ui/src/components/organisms/TaskDetail/index.ts`
- Modify: `ui/e2e/codex-agent.spec.ts`

**Interfaces:**
- Consumes: `codexAgentApi`, `useSSEEvent`, `Task`, and existing task-detail UI components.
- Produces: `TaskAgentPanel({ task, onTaskUpdated })`.

- [ ] **Step 1: Write the failing task-loop E2E test**

Maintain a mutable mocked `AgentTaskSnapshot` inside the Playwright test. Intercept `GET **/api/tasks/*/agent` and `POST **/api/tasks/*/agent/*`; update the phase for each action and append the submitted review comment.

```ts
await expect(page.getByRole("heading", { name: "Coding agent" })).toBeVisible();
await page.getByRole("button", { name: "Start investigation" }).click();
await expect(page.getByText("Investigating")).toBeVisible();

snapshot.workflow.phase = "plan-review";
await page.reload();
await page.getByRole("button", { name: "Approve plan and implement" }).click();
await expect(page.getByText("Implementing")).toBeVisible();

snapshot.workflow.phase = "code-review";
await page.reload();
await page.getByPlaceholder("Describe what Codex should change").fill("Handle empty input");
await page.getByRole("button", { name: "Request changes" }).click();
await expect(page.getByText("Handle empty input")).toBeVisible();
await expect(page.getByRole("button", { name: "Start fix" })).toBeVisible();
```

- [ ] **Step 2: Run the task-loop test and confirm it fails**

Run: `cd ui && bun test:e2e -- codex-agent.spec.ts --grep 'review loop'`

Expected: FAIL because the task agent panel is absent.

- [ ] **Step 3: Build the panel state and event refresh**

```tsx
export function TaskAgentPanel({ task, onTaskUpdated }: {
	task: Task;
	onTaskUpdated: (task: Task) => void;
}) {
	const [snapshot, setSnapshot] = useState<AgentTaskSnapshot | null>(null);
	const [status, setStatus] = useState<CodexStatus | null>(null);
	const [comment, setComment] = useState("");
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState("");
	const load = useCallback(async () => {
		const [nextStatus, nextSnapshot] = await Promise.all([
			codexAgentApi.status(),
			codexAgentApi.snapshot(task.id),
		]);
		setStatus(nextStatus);
		setSnapshot(nextSnapshot);
	}, [task.id]);

	useEffect(() => { void load(); }, [load]);
	useSSEEvent("agent:updated", event => {
		if (event.taskId === task.id) void load();
	});
	useSSEEvent("agent:progress", event => {
		if (event.taskId === task.id) setProgress(event.message ?? "");
	});

	const act = async (action: AgentAction) => {
		setBusy(true);
		try {
			setSnapshot(await codexAgentApi.action(task.id, action, comment));
			setComment("");
			onTaskUpdated(await api.getTask(task.id));
		} finally {
			setBusy(false);
		}
	};
}
```

After every action, store the returned snapshot, clear accepted comments, and call `api.getTask(task.id)` so status changes immediately reach `TaskDetailSheet`.

- [ ] **Step 4: Render only valid phase actions**

Use this exact mapping:

```text
idle + in-progress      -> Start investigation
investigating          -> Cancel run
plan-review            -> Approve plan and implement / Request plan changes
implementing           -> Cancel run
code-review            -> Approve implementation / Request changes
fix-ready              -> Start fix
completed              -> Completed
```

When the task is not `in-progress` and no run/review is active, show `Move this task to in-progress to start Codex.` Disable start buttons unless `status.installed && status.loggedIn`. Display backend errors with the existing toast and inline error text.

- [ ] **Step 5: Render run results, dirty files, separate comments, and logs**

Render the latest run status, summary, tests, and error. In `fix-ready`, show `snapshot.dirtyFiles` above Start fix so the explicit action acknowledges the existing implementation changes. Render `reviewComments` chronologically with plan/implementation badges and timestamps.

Use a native `<details>` element for the log. On first expansion call `codexAgentApi.log(task.id, latestRun.id)` and cache the returned content in component state; render it in a wrapping `<pre>`.

- [ ] **Step 6: Mount the panel in task details**

Place the panel after the existing Implementation Notes section and before Time Tracking:

```tsx
<div className="border-t border-border/40" />
<TaskAgentPanel task={task} onTaskUpdated={onUpdate} />
```

Export it from `TaskDetail/index.ts`. Do not alter the existing plan/notes editor; investigation results continue to appear there through normal task updates.

- [ ] **Step 7: Verify task UI and build**

Run: `cd ui && bunx tsc --noEmit && bun run build && bun test:e2e -- codex-agent.spec.ts`

Expected: PASS for setup and review-loop tests.

- [ ] **Step 8: Commit the task UI**

```bash
git add ui/src/components/organisms/TaskDetail/TaskAgentPanel.tsx ui/src/components/organisms/TaskDetail/TaskDetailSheet.tsx ui/src/components/organisms/TaskDetail/index.ts ui/e2e/codex-agent.spec.ts
git commit -m "feat: add Codex task review workflow"
```

---

### Task 7: Run integrated verification

**Files:**
- Verify all files from Tasks 1-6.

**Interfaces:**
- Consumes: completed backend, API, SSE, and UI slices.
- Produces: one verified Codex-only task orchestration feature with no live-account test dependency.

- [ ] **Step 1: Format changed Go files**

Run:

```bash
gofmt -w internal/models/agent.go internal/storage/agent_store.go internal/storage/agent_store_test.go internal/agents/codex/runner.go internal/agents/codex/runner_test.go internal/agents/codex/workflow.go internal/agents/codex/workflow_test.go internal/server/routes/agent.go internal/server/routes/agent_test.go internal/server/server.go
```

- [ ] **Step 2: Run focused backend tests**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./internal/storage ./internal/agents/codex ./internal/server/routes ./internal/server -run 'Agent|Codex' -count=1`

Expected: PASS.

- [ ] **Step 3: Run the complete Go suite**

Run: `GOCACHE=/tmp/knowns-agent-gocache go test ./... -count=1`

Expected: PASS.

- [ ] **Step 4: Run frontend type/build checks**

Run: `cd ui && bunx tsc --noEmit && bun run build`

Expected: PASS.

- [ ] **Step 5: Build the application and run the focused browser flow**

Run: `make all`

Expected: `bin/knowns` and embedded UI build successfully.

Run: `cd ui && TEST_BINARY=../bin/knowns bun test:e2e -- codex-agent.spec.ts`

Expected: PASS without an installed or authenticated Codex CLI because browser requests are intercepted.

- [ ] **Step 6: Run Know-Me validation and diff checks**

Run: `GOCACHE=/tmp/knowns-agent-gocache go run ./cmd/knowns validate --plain`

Expected: no new validation errors from the agent feature; if the repository's known baseline errors remain, record them verbatim in the handoff.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 7: Review scope and commit any verification-only corrections**

Run: `git status --short` and `git diff --stat`.

Expected: only planned files or generated build artifacts already tracked by the repository are changed. If a verification fix was necessary, stage only its planned files and commit it:

```bash
git commit -m "fix: complete Codex task agent verification"
```
