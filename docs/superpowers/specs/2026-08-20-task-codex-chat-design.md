# Task-Scoped Codex Chat Design

## Goal

Give every task one persistent, interactive Codex conversation. The
conversation appears in the task detail view, supports direct Auto-mode
follow-ups, and remains shared with the existing gated investigation,
implementation, review, fix, and resume workflow.

## Approved decisions

- Use the existing global `ChatSession` model, store, message shape, and chat
  rendering primitives rather than creating a second task-chat domain.
- Create one Codex chat session per task. Its transcript is the canonical
  readable conversation for that task.
- Reuse the task's existing ACP session for both Auto messages and gated
  workflow prompts so Codex retains context.
- Auto chat is a direct-edit path and uses ACP workspace-write mode with the
  existing safe permission policy. It never selects danger-full-access.
- Auto chat coexists with the explicit workflow gates; it does not replace
  them or automatically approve them.
- Auto chat is available only while the task is `in-progress` and the agent
  phase is `idle` or `fix-ready`. It is disabled during investigation,
  implementation, plan review, code review, interrupted, and completed phases.
- Auto runs do not advance the task status or satisfy a formal review/fix
  gate. The user must still use the existing gate controls.
- On maximized desktop task details, the layout is:

  ```text
  task content | fixed task metadata | resizable Codex rail
  ```

- On smaller sheets, task content and Codex become tabs. The Codex tab uses
  the full available width and contains both chat and workflow controls.
- The global `/chat` OpenCode session list is not expanded in this change.
  Codex task sessions use the global ChatSession storage/model and reusable
  message renderer, but remain hosted by task details until a unified chat
  surface is explicitly requested.

## Scope

### Included

- Codex `ChatSession` creation and task linking.
- Persistent user and assistant message history for every gated and Auto
  interaction.
- Live assistant-message streaming through the existing SSE chat events.
- Task-detail chat composer and resizable desktop Codex rail.
- Tabbed Codex presentation for smaller task sheets.
- Auto-mode message dispatch through the existing ACP manager.
- Gated workflow prompts and review comments appended to the same transcript.
- Explicit interruption, error, cancellation, and active-run handling.

### Not included

- A second Codex chat provider in the global OpenCode chat sidebar.
- A new message database or task-specific transcript format.
- Raw ACP protocol or tool telemetry rendered as permanent chat messages.
- Changing task statuses or removing the existing approval gates.
- Automatic Codex installation, login, credential storage, or authentication
  flows.

## Architecture

### Ownership

`ChatStore` owns the readable transcript. `AgentStore` continues to own
Codex workflow state, run records, review comments, dirty-file information,
and interruption/resume metadata. The two stores are linked explicitly:

```text
AgentWorkflow.ChatSessionID -> ChatSession.ID
ChatSession.TaskID          -> Task.ID
AgentRun.ID                 -> ChatMessage.RunID (when applicable)
```

The transcript is never copied into task Markdown or the agent run log. The
run log remains the bounded, redacted source for raw ACP diagnostics and tool
activity.

### Codex ChatSession

The existing chat model accepts `agentType: "codex"`. A task-bound Codex
session has:

- a local `ChatSession.ID` used by the chat API;
- `ChatSession.TaskID` set to the owning task;
- `ChatSession.SessionID` set to the ACP session ID once ACP creates one;
- `ChatSession.Status` set to `idle`, `streaming`, or `error`;
- `ChatSession.Messages` containing the ordered user and assistant turns.

The session is created lazily when the task agent snapshot or first task-agent
action needs it. The workflow stores its ID so later requests never need to
guess which session belongs to the task. Task-bound Codex sessions cannot be
deleted independently from the task panel. Permanent task deletion cascades
to the linked chat; archiving leaves the chat intact.

### Message shape

Keep the existing `ChatMessage` fields and add only the metadata needed to
connect a message to agent execution:

- `runId` — optional related `AgentRun.ID`;
- `phase` — optional `investigation`, `implementation`, `fix`, or `chat`.

The transcript includes:

- direct user Auto messages;
- visible workflow actions such as starting investigation or approving a
  plan;
- plan-review and implementation-review comments;
- assistant responses and final workflow summaries.

Task metadata, hidden system instructions, raw JSON protocol messages, and
individual tool diagnostics remain outside the transcript. While a response
streams, one assistant message is updated in place rather than appending a
message for every chunk.

### Agent runs

Add `AgentRunPhaseChat`. An Auto prompt records a normal `AgentRun` before
starting ACP, uses the task's existing session, and is subject to the same
project workspace lock as gated runs. A successful Auto run leaves the task
and agent phase unchanged; the resulting dirty-file list remains visible to
the task panel.

## API and event flow

### Existing task-agent API

The task-agent snapshot adds the linked `chatSessionId`. Existing gated
actions keep their current routes and transitions:

```text
GET  /api/tasks/{id}/agent
POST /api/tasks/{id}/agent/{action}
```

Before a gated prompt is sent, the manager appends the visible action or
review comment as a user message. When Codex completes, the readable result
is appended as an assistant message linked to the run.

### Chat API

The existing chat routes are extended for Codex sessions:

```text
GET  /api/chats/{chatID}
POST /api/chats/{chatID}/send
POST /api/chats/{chatID}/stop
GET  /api/chats/{chatID}/queue
POST /api/chats/{chatID}/process-queue
```

`POST /send` validates that the session is task-bound Codex, resolves the
task and workflow, enforces the Auto eligibility phases, appends the user
message, and returns an accepted response after the Auto run is recorded.
The existing queue behavior is reused for additional Auto messages while an
Auto prompt is streaming. Messages are not queued while a gated run owns the
task.

The route dispatches to `codex.Manager`; it does not invoke a shell command
or duplicate ACP process management. The configured command is still passed
as an executable plus argument array, never as interpolated user text.

### SSE

Codex chat uses the existing chat event names:

- `chats:created` when a task chat is created;
- `chats:updated` when session status, queue, or metadata changes;
- `chats:message` for a full message snapshot, including updates to the same
  streaming message ID.

The frontend upserts `chats:message` by message ID. On completion, failure,
cancel, or interruption it reloads the ChatSession and agent snapshot so the
transcript and workflow state cannot drift apart.

## Task-detail experience

### Maximized desktop

The existing task detail dialog keeps the task content and metadata sidebar,
then adds the Codex rail as the far-right column. The metadata column remains
fixed. The Codex rail has a draggable divider with a minimum and maximum
width, and both the chat scroll region and workflow controls remain usable
while the task content is independently scrolled.

The Codex rail header shows:

- Codex connection/session state;
- the `Auto` mode label;
- the current agent phase;
- refresh and stop/resume controls where valid.

The center of the rail reuses `ChatThread` and the existing Markdown/message
rendering. The composer is pinned to the bottom. Workflow actions and review
comments remain available in the same rail without becoming chat commands.

### Smaller sheets and mobile

The task sheet uses tabs for `Task` and `Codex`. The Task tab contains the
existing task content and metadata. The Codex tab expands to the full sheet
width and contains the persistent conversation, composer, run state, and
workflow controls. The resize handle is hidden outside the desktop layout.

### Auto interaction

When Auto is eligible, sending a message:

1. appends the user message immediately;
2. creates an assistant placeholder and a `chat` run;
3. starts or reuses the task ACP process/session in workspace-write mode;
4. streams assistant updates into the placeholder message;
5. stores the final response, summary, tests, and run status;
6. refreshes the workflow snapshot and dirty-file warning.

The composer is disabled for gated review/run phases, interrupted sessions,
completed tasks, missing Codex setup, and active gated runs. It shows the
existing setup, interruption, or active-run explanation instead of silently
discarding input.

## Gated workflow coexistence

The existing phase transitions remain authoritative:

- investigation uses ACP read-only mode;
- implementation and fixes use ACP workspace-write mode;
- plan and implementation approval remain explicit actions;
- review comments remain separate persisted records and are also visible as
  user turns in the chat;
- Resume remains the only way to continue an interrupted ACP session.

Auto chat does not change these transitions. If Auto makes workspace changes
while the task is idle or fix-ready, the panel shows the resulting dirty files
and the user still chooses whether to continue with a gated action. Existing
dirty-workspace preflight rules remain in force.

## Error and recovery behavior

- Missing `codex-acp` or authentication keeps the composer disabled and uses
  the existing installation/login guidance.
- A second run attempt returns the existing conflict error without adding a
  duplicate prompt.
- ACP cancellation stores the partial assistant message and cancelled run.
- ACP disconnect or server restart marks the run interrupted, preserves the
  partial assistant message and ACP session ID, and disables new messages
  until explicit Resume.
- Malformed ACP output, non-zero adapter exit, or invalid final output marks
  the run failed without advancing the task workflow.
- Reopening the task fetches the ChatSession from disk; browser-local state is
  used only for the current rail width and active tab.
- Chat/session persistence failures fail the request before starting ACP, so
  a run cannot exist without a durable user message and run record.

## Implementation boundaries

Expected areas of change:

- Go chat models/store/routes and server wiring;
- Codex manager workflow and ACP update-to-message adapter;
- agent snapshot/run model additions;
- task-detail layout and Codex rail/composer components;
- existing chat message upsert handling and task-agent API types;
- focused Go tests and task-detail browser tests.

Reuse existing storage, SSE, ACP, task lifecycle, `ChatThread`, Markdown,
layout and drag-interaction patterns, and test helpers. Do not add a
dependency or create a second chat renderer, message store, or ACP client.

## Verification

### Backend

- ChatSession and ChatMessage JSON round-trip with Codex/task/run metadata.
- One-session-per-task creation and workflow linking.
- Codex `/send` validation, Auto phase restrictions, queue behavior, and
  active-run conflicts.
- User/assistant message persistence and streaming message upserts.
- Gated actions append to the same transcript.
- ACP success, cancellation, disconnect, malformed response, and Resume
  behavior.
- Permanent task deletion removes the linked task chat; archive preserves it.

### Frontend

- Codex task history loads after closing and reopening the task.
- Assistant streaming updates replace the same message instead of duplicating
  bubbles.
- Auto composer, disabled gated states, setup errors, and interruption/resume
  states render correctly.
- Maximized desktop renders task content, metadata, and resizable Codex rail.
- Smaller sheets and mobile render Task/Codex tabs without a resize handle.
- Existing OpenCode global chat behavior remains unchanged.

Run focused Go and UI checks, the relevant repository validation, and
`git diff --check` before implementation is considered complete.
