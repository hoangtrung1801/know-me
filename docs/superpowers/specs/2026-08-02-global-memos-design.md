# Global Memos Design

## Goal

Add a global Memo tab for quickly capturing titleless Markdown notes. Users can create multiple memos per day, browse them newest-first in date groups, search their contents, edit them, and delete them. The same operations are available through the web UI, CLI, and MCP.

## Scope

The first release includes:

- Global memos available across projects and without an active project.
- Titleless Markdown content.
- Create, list, search, edit, and delete operations.
- A newest-first feed grouped by Today, Yesterday, and earlier local dates.
- REST, CLI, and MCP access backed by the same service.

Tags, attachments, pinning, archiving, and semantic or indexed search are out of scope. They can be added when actual usage requires them.

## Storage

Each memo is stored as `~/.knowns/memos/<id>.md`. The path-safe generated filename is the memo ID. The Markdown file contains UTC timestamps in YAML frontmatter and the memo content as its body:

```md
---
createdAt: 2026-08-02T10:30:00Z
updatedAt: 2026-08-02T10:30:00Z
---

Today I learned...
```

The store uses the repository's existing YAML support and atomic-write pattern. Listing reads memo files, derives IDs from filenames, and sorts by `createdAt` descending with ID as a deterministic tie-breaker. Search is a case-insensitive substring match against Markdown content. This avoids a database or search index for the expected small personal collection.

## Shared Service

A small Go memo service is the single behavior boundary for REST, CLI, and MCP. It provides:

- `Add(content)`
- `List(query)`
- `Update(id, content)`
- `Delete(id)`

The service trims outer whitespace, rejects blank content, generates IDs, owns timestamps, and maps invalid or missing IDs to stable errors. Updates preserve `createdAt` and replace `updatedAt`. Deletes permanently remove one memo.

## Web API

Global routes are registered outside the active-project middleware, following Saved Links:

- `GET /api/memos?q=<query>` lists or searches memos.
- `POST /api/memos` creates a memo from `{ "content": "..." }`.
- `PATCH /api/memos/{id}` replaces content from `{ "content": "..." }`.
- `DELETE /api/memos/{id}` removes a memo and returns no content.

Blank content returns `400`, a missing memo returns `404`, and unexpected storage failures return `500`.

## Memo Tab

The sidebar gains a Memo item and `/memos` route. The page follows existing `PageShell` conventions:

- A compact Markdown textarea and Add memo button sit at the top.
- A search field filters through the server-backed list endpoint.
- Results appear newest-first under Today, Yesterday, or a formatted earlier date.
- Each memo renders Markdown and shows its local time.
- Edit replaces the rendered memo with a textarea and Save/Cancel actions.
- Delete opens a confirmation dialog before calling the hard-delete endpoint.
- Existing page patterns handle loading, empty, no-results, and error states.

The UI uses the existing Markdown renderer, textarea, button, dialog, and page components. No new frontend dependency is needed.

## CLI and MCP

The CLI adds:

- `knowns memo add <content>`
- `knowns memo list [--search <query>]`
- `knowns memo update <id> <content>`
- `knowns memo delete <id>`

Plain output stays compact; the existing global `--json` behavior returns complete memo objects.

MCP adds one `memo` tool with `add`, `list`, `update`, and `delete` actions. `content` is required for add/update, `id` is required for update/delete, and `query` is optional for list. Help entries document every action.

## Validation

Focused checks cover:

- Markdown/frontmatter storage round trips, ordering, search, update timestamps, deletion, blank content, and unsafe IDs.
- REST status codes and payloads.
- CLI commands and JSON/plain output.
- MCP actions and required parameters.
- One browser flow that adds memos, verifies date grouping, searches, edits, and deletes.

