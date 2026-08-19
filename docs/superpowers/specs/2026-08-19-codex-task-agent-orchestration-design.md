# Codex Task Agent Orchestration Design

## Goal

Add a gated coding-agent workflow for Know-Me tasks. A user can create a task,
ask Codex to investigate it, review the resulting plan and notes, approve the
implementation, review the code, and send feedback through repeated fix cycles
until the task is done.

Version one supports connecting to and controlling the locally installed Codex
CLI only.

## Decisions

- Keep the existing task statuses unchanged: `todo`, `in-progress`,
  `in-review`, `done`, and the existing non-terminal statuses.
- Persist a separate agent phase so task lifecycle and agent execution state do
  not become the same concept.
- Status edits never start Codex. Every Codex run requires an explicit user
  action.
- Run Codex in the current project workspace. Do not create a worktree in this
  version.
- Treat a clean workspace as a prerequisite for implementation and fix runs.
- Use `codex exec` for both investigation and implementation. Start a new run
  for each phase so the read-only and workspace-write permission boundaries are
  explicit. App Server is deferred.
- Investigation runs use read-only sandboxing. Implementation and fix runs use
  workspace-write sandboxing. Never use danger-full-access.
- Store review comments as a separate history from task implementation notes.
- A plan approval starts implementation. A final implementation approval moves
  the task to `done`. Review feedback moves it back to `in-progress`, but a fix
  still requires an explicit start action.
- Detect Codex and guide the user through installation or login when it is
  unavailable. Do not install binaries or modify credentials automatically.
- Allow one active agent run per project workspace in version one.

## Existing code to reuse

- The existing task model and task lifecycle service continue to own task
  status, implementation plan, implementation notes, acceptance criteria, and
  task version history.
- The existing task detail view and implementation section display the plan and
  notes. The agent panel should be added there rather than creating a separate
  task workflow page.
- The existing ConfigPage AI section is the home for Codex connection status.
- The existing SSE broadcaster carries agent progress and state changes.
- The existing `.knowns` JSON storage pattern is used for agent workflow data.
- The existing OpenCode integration remains separate. It is not used as the
  Codex runner or connection state.

## Agent state

The persisted workflow state for a task uses these phases:

| Task status | Agent phase | Meaning |
| --- | --- | --- |
| `in-progress` | `idle` | Ready to investigate, or ready to re-investigate after plan feedback |
| `in-progress` | `investigating` | Codex is running with read-only access |
| `in-progress` | `plan-review` | Investigation output is ready for user review |
| `in-progress` | `implementing` | Codex is modifying the workspace |
| `in-review` | `code-review` | Implementation is ready for user review |
| `in-progress` | `fix-ready` | Review feedback exists and a fix can be started |
| `done` | `completed` | The user approved the implementation |

Run failures are represented by the run status and error details rather than
silently advancing the workflow phase. The task status is never advanced when
Codex exits unsuccessfully or returns invalid structured output.

## Persistence

Add one agent store under `.knowns` using the existing JSON store conventions.
It contains independent records linked by task ID and run ID:

```text
AgentWorkflow
  taskID
  phase
  activeRunID
  updatedAt

AgentRun
  id
  taskID
  phase
  status
  codexThreadID
  startedAt
  finishedAt
  exitCode
  summary
  error
  logPath

ReviewComment
  id
  taskID
  stage: plan | implementation
  body
  createdAt
  runID
```

Investigation output is validated and saved through the existing task service
into `ImplementationPlan` and `ImplementationNotes`. Implementation and fix
runs return a summary and test result that are retained on the run and shown
in the task panel; any task-note update uses the existing task update path so
task history remains intact.

Agent output logs live under the existing Know-Me runtime data area and are
referenced by `logPath`; they are not copied into task Markdown.

## Codex connection and runner

The server provides a Codex status operation that:

1. Resolves the executable with the platform command lookup.
2. Reads the installed version.
3. Checks login status without exposing authentication output.
4. Returns a small status object and user-facing setup guidance.

The runner invokes Codex with argument arrays and the active project root as
its working directory. It uses JSONL output for progress and a validated final
result for phase-specific data. The prompt includes the task description,
acceptance criteria, existing plan and notes, and relevant review comments.

Investigation prompts require read-only inspection and return an implementation
plan, findings, risks, and notes. They must not edit task metadata or project
files.

Implementation and fix prompts require the agent to implement the task or
address the supplied review comments, run relevant tests, and return a concise
summary and test results. They may modify project files within the
workspace-write sandbox.

Each run is recorded before the child process starts. JSONL events update the
run and are broadcast through SSE. The final event, exit code, and validated
result determine the run outcome.

## User flows

### Codex setup

The AI settings card shows Connected, Not installed, or Needs login. When
setup is incomplete, the card provides copyable commands and a refresh action.
Know-Me does not install Codex, open a credential flow, or store credentials.

### Investigation

1. The user starts investigation from an `in-progress` task.
2. The server validates Codex status, workspace identity, and the absence of
   another active run.
3. Codex runs read-only and returns structured findings.
4. The server saves the plan and notes through the existing task service.
5. The task remains `in-progress` and the agent phase becomes `plan-review`.

### Plan review

The user reviews the existing plan and notes in the task panel. Approving the
plan starts a new workspace-write implementation run. Requesting changes
requires a comment, appends a separate plan-review comment, and returns the
agent phase to `idle` for another investigation.

### Implementation review

1. A successful implementation or fix run changes the task to `in-review` and
   sets the agent phase to `code-review`.
2. The panel shows the run summary, tests, changed-workspace warning, and
   review-comment history.
3. Approval changes the task to `done` and the agent phase to `completed`.
4. Requested changes require a comment, set the task to `in-progress`, and set
   the phase to `fix-ready`.
5. Starting a fix launches a new workspace-write run with the review comments
   as context. A successful fix returns the task to `in-review`.

## API and events

Expose task-scoped agent operations under `/api/tasks/{id}/agent`:

- Get current workflow state and the latest run.
- Get the separate review-comment history.
- Start investigation.
- Approve the plan.
- Request plan changes with a comment.
- Approve implementation.
- Request implementation changes with a comment.
- Start a fix.
- Cancel an active run.

Invalid phase transitions, missing comments, dirty write workspaces, missing
Codex, and active-run conflicts return validation errors without changing task
state.

Broadcast agent state, run progress, and run completion through the existing
SSE channel. Existing task update events continue to represent task field and
status changes.

## Failure and recovery behavior

- A missing executable or logged-out Codex blocks the run and leaves the task
  unchanged.
- A dirty workspace blocks implementation and fix starts and reports the
  conflicting files.
- A non-zero exit, cancellation, malformed JSONL, or invalid final result
  marks the run failed without advancing task status.
- Implementation can leave partial workspace changes after a failed process;
  the task stays `in-progress` and the failed run remains visible for user
  inspection.
- On server restart, persisted active runs are marked interrupted. Know-Me
  never resumes a coding run automatically.
- Logs exclude authentication tokens and sensitive environment values.
- The runner never uses danger-full-access and never interpolates user input
  into a shell command.

## Scope

Included:

- Codex executable/version/login detection and setup guidance.
- Task-scoped agent workflow state and run persistence.
- Read-only investigation and workspace-write implementation/fix runs.
- Explicit plan and implementation review gates.
- Separate review-comment history.
- Task-detail workflow controls and progress display.
- SSE progress events and failure visibility.

Not included:

- Codex App Server.
- Worktree creation or branch management.
- Automatic runs triggered by status changes.
- Parallel runs, queues, or cross-workspace scheduling.
- Providers other than Codex.
- Automatic Codex installation or credential management.
- Multi-user reviewer permissions.

## Verification

Add focused tests for:

- Codex executable, version, and login detection.
- Command construction and sandbox selection.
- JSONL event parsing and final-result validation.
- Valid and invalid agent phase transitions.
- Run persistence, failure handling, restart interruption, and retry.
- Separate review-comment persistence and ordering.
- Dirty-workspace and active-run preflight checks.
- Agent API responses and SSE events.

Use a fake Codex executable in automated tests. Do not invoke a live Codex
account in the test suite. Run the focused Go and UI checks, then the relevant
repository validation and `git diff --check`.
