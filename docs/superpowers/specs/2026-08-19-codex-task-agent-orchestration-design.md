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
- Treat a clean workspace as a prerequisite for the first implementation run.
  Fix runs intentionally continue over the reviewed implementation changes and
  show the current dirty-file list before the user starts them.
- Use `codex-acp` as a task-scoped stdio ACP server. Create one ACP session per
  task and keep that session across investigation, implementation, and fix
  prompts so the agent retains context at every review gate.
- Launch one adapter process for an active task. Use ACP `session/new` for the
  first prompt, `session/set_mode` when moving between read-only and
  workspace-write work, and `session/prompt` for each phase. Close the process
  after the task is completed; a cancelled prompt does not discard the task
  session.
- Persist the ACP session ID. If the server restarts or the adapter disconnects,
  mark the active run interrupted and require an explicit Resume action that
  launches a new adapter process and loads the saved session. Never resume
  coding automatically.
- Investigation runs use read-only sandboxing. Implementation and fix runs use
  workspace-write sandboxing. Never use danger-full-access.
- Automatically approve ACP permission requests on the user's behalf. The
  selected read-only or workspace-write mode remains enforced by the adapter;
  the client never selects danger-full-access.
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
| `in-progress` | `interrupted` | An active run or adapter connection was interrupted and can be resumed explicitly |
| `done` | `completed` | The user approved the implementation |

Run failures are represented by the run status and error details rather than
silently advancing the workflow phase. The task status is never advanced when
Codex exits unsuccessfully or returns invalid structured output.

## Persistence

Add one agent store under `.knowns` using the existing JSON store conventions.
It contains independent records linked by task ID and run ID:

```text
AgentWorkflow
  projectID
  taskID
  phase
  activeRunID
  codexSessionID
  resumePhase
  updatedAt

AgentRun
  id
  projectID
  taskID
  phase
  status
  codexSessionID
  startedAt
  finishedAt
  exitCode
  summary
  error
  logPath

ReviewComment
  id
  projectID
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

`codexSessionID` belongs to the workflow because it is reused by every run for
the task. A run records the same ID for traceability. Adapter processes and
their in-memory protocol handles are not persisted. When `phase` is
`interrupted`, `resumePhase` records the phase that the Resume action should
continue.

## Codex ACP connection and session client

The server provides a Codex status operation that:

1. Resolves the configured adapter command, defaulting to `codex-acp`, with the
   platform command lookup.
2. Reads the installed adapter version with `codex-acp --version` (or the
   equivalent configured command).
3. Performs a connection/authentication check without exposing credential
   output.
4. Returns a small status object and user-facing setup guidance.

The default setup guidance is `npm install -g @agentclientprotocol/codex-acp`.
An explicit configured command such as `npx -y @agentclientprotocol/codex-acp`
is allowed, but Know-Me never downloads the adapter silently while starting a
task. `CODEX_PATH` remains available for choosing the Codex binary used by the
adapter. Know-Me does not open login flows or store credentials.

The client launches the adapter with executable/argument arrays and the active
project root as its working directory, then speaks newline-delimited JSON-RPC
over stdin/stdout. It performs the ACP initialize handshake and creates or
loads the task session. It sends the task description, acceptance criteria,
existing plan and notes, and relevant review comments as prompt context.

Investigation uses ACP read-only mode and requires inspection only. It returns
an implementation plan, findings, risks, and notes without editing task
metadata or project files. Implementation and fix prompts switch the same
session to ACP workspace-write mode, implement the task or address the supplied
review comments, run relevant tests, and return a concise summary and test
results.

The client answers ACP permission requests by selecting the applicable allow
option automatically. ACP `session/update` notifications are the authoritative
progress stream and are mapped to the existing run log and SSE events. Raw ACP
messages are redacted and bounded before being written to the log.

Each run is recorded before its prompt starts. The final assistant response
must be exactly one JSON object containing the existing
`implementationPlan`, `implementationNotes`, `summary`, and `tests` fields.
The client validates that object before applying task changes or advancing the
workflow. A malformed response, protocol error, non-zero adapter exit, or
cancellation cannot advance task status.

## User flows

### Codex setup

The AI settings card shows Connected, Not installed, or Needs authentication.
When setup is incomplete, the card provides copyable `codex-acp` installation
or authentication guidance and a refresh action. Know-Me does not install the
adapter, open a credential flow, or store credentials.

### Investigation

1. The user starts investigation from an `in-progress` task.
2. The server validates adapter status, workspace identity, and the absence of
   another active run.
3. The server launches the task adapter if needed, creates the ACP session, and
   sends a read-only prompt.
4. Codex returns structured findings through the persistent session.
5. The server saves the plan and notes through the existing task service.
6. The task remains `in-progress` and the agent phase becomes `plan-review`.

### Plan review

The user reviews the existing plan and notes in the task panel. Approving the
plan sends a new workspace-write prompt on the same ACP session. Requesting
changes requires a comment, appends a separate plan-review comment, and returns
the agent phase to `idle` for another investigation prompt.

### Implementation review

1. A successful implementation or fix prompt changes the task to `in-review`
   and sets the agent phase to `code-review`.
2. The panel shows the run summary, tests, changed-workspace warning, and
   review-comment history.
3. Approval changes the task to `done` and the agent phase to `completed`.
4. Requested changes require a comment, set the task to `in-progress`, and set
   the phase to `fix-ready`.
5. Starting a fix sends a new workspace-write prompt on the same ACP session
   with the review comments as context. A successful fix returns the task to
   `in-review`.

### Interrupted run

When the panel shows an interrupted run, it displays the saved session ID,
interrupted phase, and Resume action. Resume relaunches `codex-acp`, loads the
session, restores the recorded mode, and sends a continuation prompt. The
user can then review the result at the same gate; no prompt is sent until the
user explicitly resumes.

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
- Resume an interrupted run.
- Cancel an active run.

The workflow response includes the session ID and derived adapter state
(`running` or `stopped`), plus `resumable` and `interrupted` flags. The existing
SSE stream carries ACP updates, so the panel refreshes the bounded run log
while a run is active and once it finishes; it does not leave the initial log
snapshot stale. Permission requests are not shown as a separate UI gate.

Invalid phase transitions, missing comments, a dirty initial implementation
workspace, missing adapter, and active-run conflicts return validation errors
without changing task state.

Broadcast agent state, run progress, and run completion through the existing
SSE channel. Existing task update events continue to represent task field and
status changes.

## Failure and recovery behavior

- A missing `codex-acp` command or unavailable authentication blocks the run
  and leaves the task unchanged.
- A dirty workspace blocks the first implementation start and reports the
  conflicting files. Fix starts allow the existing reviewed changes and show
  their dirty-file list before the explicit action.
- A non-zero adapter exit, cancellation, malformed ACP message, or invalid
  final result marks the run failed without advancing task status.
- Implementation can leave partial workspace changes after a failed process;
  the task stays `in-progress` and the failed run remains visible for user
  inspection.
- On server restart, persisted active runs are marked interrupted, their active
  run IDs are cleared, and their prior phase is saved in `resumePhase`. The
  session ID remains available for an explicit Resume action. An unexpected
  adapter disconnect follows the same path. Know-Me never resumes a coding run
  automatically.
- Logs exclude authentication tokens and sensitive environment values.
- The ACP client never selects danger-full-access and never interpolates user
  input into a shell command. The project run lock still prevents concurrent
  workspace edits across processes.

## Scope

Included:

- `codex-acp` executable/version/authentication detection and setup guidance.
- Task-scoped agent workflow state and run persistence.
- Read-only investigation and workspace-write implementation/fix runs.
- Explicit plan and implementation review gates.
- Separate review-comment history.
- One persistent ACP session per task with explicit interrupted-run resume.
- ACP permission auto-approval within the selected sandbox mode.
- Task-detail workflow controls and progress display.
- SSE progress events and failure visibility.

Not included:

- Direct Codex App Server integration; `codex-acp` owns that adapter boundary.
- The previous one-shot `codex exec` runner.
- A Node.js bridge or HTTP agent daemon.
- Worktree creation or branch management.
- Automatic runs triggered by status changes.
- Parallel runs, queues, or cross-workspace scheduling.
- Providers other than Codex.
- Automatic Codex installation or credential management.
- Multi-user reviewer permissions.

## Verification

Add focused tests for:

- `codex-acp` executable/version detection and setup guidance.
- ACP initialize, `session/new`, session reuse, `session/load`, and explicit
  resume.
- ACP mode changes and automatic permission responses.
- ACP streamed updates, bounded/redacted logging, cancellation, process exit,
  protocol errors, and final-result validation.
- Valid and invalid agent phase transitions.
- Run/session persistence, failure handling, restart interruption, and retry.
- Cross-process project locking and session ownership.
- Separate review-comment persistence and ordering.
- Initial dirty-workspace and active-run preflight checks.
- Agent API responses, SSE events, live run-log refresh, and interrupted-run
  browser flows.

Use a fake ACP stdio server in automated tests; it should speak the same
newline-delimited JSON-RPC messages as `codex-acp`. Do not invoke a live Codex
account or download packages in the test suite. Run the focused Go and UI
checks, then the relevant repository validation and `git diff --check`.
