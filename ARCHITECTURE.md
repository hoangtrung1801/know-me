# Architecture

Current-state technical overview of Know-Me for contributors.

This document describes the implementation in this repository. It is not a
future roadmap. Optional and actively evolving integrations are called out
explicitly. For product principles, see [PHILOSOPHY.md](./PHILOSOPHY.md).

## At a glance

Know-Me is a local-first Go application distributed as one executable. The
same core storage and domain models are exposed through three entry points:

- the Cobra CLI (`knowme`);
- the local browser server and embedded React UI; and
- the stdio MCP server used by AI agents.

The application stores durable project knowledge locally, then builds derived
search indexes and runs optional local or external runtimes around that data.

```text
                         Users and AI agents
                                  |
             +--------------------+--------------------+
             |                    |                    |
       Cobra CLI            Browser UI             MCP client
     cmd/knowme             React + Vite             stdio JSON-RPC
             |                    |                    |
             v                    v                    v
      internal/cli       internal/server        internal/mcp/handlers
             |             Chi routes + SSE             |
             +--------------------+--------------------+
                                  |
                    models + storage.Store/Manager
                         +--------+--------+
                         |                 |
                  project/global data   derived services
                  .know-me + ~/.know-me   search, refs, runtimes
```

The main dependency direction is inward:

```text
entry points -> adapters/orchestration -> domain models and storage
                                      -> optional search/runtime integrations
```

CLI commands, HTTP routes, and MCP handlers are adapters. They should reuse
the shared store and domain services instead of implementing a second file
format or business rule.

## Runtime topology

### CLI process

`cmd/knowme/main.go` only translates process errors into exit codes and calls
`internal/cli.Execute`. The CLI uses Cobra to register commands such as
`task`, `doc`, `search`, `retrieve`, `memory`, `decision`, `time`,
`browser`, `mcp`, `lsp`, `runtime`, and `setup`.

Most commands resolve a project or global store, call a domain/storage
operation, and render plain, JSON, or interactive output. The CLI is also the
launcher for the browser server, MCP server, runtime worker, and LSP daemon.

### Browser server

`internal/server` owns the HTTP process. `NewServer` wires together:

- the active `storage.Store` and multi-project `storage.Manager`;
- the Chi router and route groups;
- optional password authentication;
- the shared `SSEBroker`;
- Codex, OpenCode, LSP, and tunnel managers when configured; and
- startup recovery and background monitors.

The router serves JSON APIs under `/api`, the shared event stream at
`/api/events`, the chat WebSocket at `/ws/chat`, optional OpenCode proxy
routes, and the embedded UI assets. The server is a local application server,
not a separate application tier: route handlers call the shared core in the
same process.

### MCP server

`internal/mcp` wraps `mcp-go` and exposes Know-Me operations over stdio JSON-RPC.
Handlers are registered by capability: project, task, doc, time, search,
code, template, validation, memory, decision, link, and memo.

MCP startup has two important boundaries:

1. `initial` returns the project operating context and must be called at the
   start of an agent session.
2. `help` provides detailed schemas and workflow guidance on demand.

Permission middleware guards tool calls, lifecycle hooks write audit events,
and the current store can be switched with the project tool. MCP does not
maintain a second persistence model; handlers use the same storage and search
packages as the CLI and browser server.

### Helper processes

Some work is intentionally moved out of the interactive process:

- `internal/runtimequeue` coordinates durable jobs, leases, polling, and
  results for search/index work;
- `internal/lspdaemon` exposes a project-scoped local RPC service that keeps
  language servers alive and reuses them across requests; and
- `internal/agents/codex` starts an ACP child process for Codex task work.

These are local process boundaries, not remote service dependencies. They use
project paths, lock files, and small JSON protocols to exchange state.

## Package map

| Package | Responsibility | Main boundary |
|---|---|---|
| `cmd/knowme` | Executable entry point | Process exit and CLI startup |
| `internal/cli` | Cobra commands, project resolution, rendering, setup | User-facing command adapter |
| `internal/models` | Tasks, docs, decisions, memory, chat, agent, config, search, and runtime types | Shared data contracts |
| `internal/storage` | `Store`, sub-stores, file formats, locks, versions, reference resolution | Durable state and project scope |
| `internal/registry` | Machine-level project registry | Logical project selection |
| `internal/server` | HTTP lifecycle, middleware, SSE broker, WebSocket/proxy plumbing | Browser process boundary |
| `internal/server/routes` | Resource-oriented HTTP handlers | JSON API adapter |
| `internal/mcp` | MCP server lifecycle, permissions, audit, dynamic project state | AI tool adapter |
| `internal/mcp/handlers` | MCP tool groups and structured responses | MCP capability boundary |
| `internal/search` | Keyword, semantic, hybrid search, indexing, retrieval, evaluation | Derived knowledge access |
| `internal/references` | `@doc`, `@task`, `@memory`, and related reference parsing | Cross-entity links |
| `internal/tasklifecycle` | Task status, archive, purge, and lifecycle policy | Shared task transitions |
| `internal/decisionreview`, `internal/memoryreview` | Review and migration policy | Decision/memory safety checks |
| `internal/agents/codex` | ACP transport, task workflow, runs, review gates, task chat | Codex process boundary |
| `internal/agents/opencode` | OpenCode client, daemon, readiness, events, and runtime state | OpenCode integration boundary |
| `internal/lsp` | Language adapters, project detection, sessions, diagnostics, edits | Language intelligence |
| `internal/lspdaemon` | Long-lived LSP process and client protocol | LSP process boundary |
| `internal/runtimequeue` | Durable local job queue and runtime leases | Background-work boundary |
| `internal/runtimememory` | Bounded memory retrieval/injection and capture decisions | AI runtime context |
| `internal/links`, `internal/memos` | Global saved-link and memo services | Global workspace features |
| `ui` | Embedded Vite build and React application | Browser presentation |

The package list is intentionally a map, not a rule that every feature needs a
new package. Prefer an existing package when the responsibility already fits.

## Storage and data ownership

### Store and project scope

`storage.Store` is the top-level coordinator for the `.know-me` data format. It
owns sub-stores for tasks, docs, config, time, templates, versions,
workspaces, chats, memory, decisions, and agent state.

- `storage.NewStore(root)` opens a repository-local store.
- `storage.NewProjectStore(globalRoot, projectID, repositoryRoot)` opens the
  global store while applying an active logical project scope.
- `storage.Manager` protects the active store and registry for browser project
  switching.

Project identity is carried separately from repository path. A task or doc
can therefore be resolved within a project while global commands can still
search across projects.

### Durable files

A normal project store is rooted at the repository's `.know-me/` directory.
The exact set grows with enabled features, but the important ownership is:

```text
.know-me/
├── config.json                 project settings and feature flags
├── tasks/*.md                  active tasks with YAML frontmatter
├── archive/*.md                archived tasks
├── docs/**/*.md                project documents
├── decisions/*.md              system decisions
├── memory/*.md                 project memory entries
├── templates/                  code/document templates
├── versions/                   task and document history
├── chats.json                  readable chat sessions and messages
├── agent-workflows.json        Codex workflow, runs, and review comments
├── workspaces.json             workspace/runtime records
├── time.json                   active timers
├── time-entries.json           recorded time entries
├── .search/                    derived indexes, locks, queue state, and requests
└── runtime/                    runtime logs and process-specific state
```

The machine-level `~/.know-me/` store holds global data such as the project
registry, global memory, saved links, memos, embedding models/settings, and
logs. Some project metadata also lives there when the global multi-project
store is active.

The source of truth is the durable entity data, not a derived search index or
runtime log:

- Markdown plus YAML frontmatter is used for tasks, docs, decisions, memory,
  and memos.
- JSON is used for configuration, chats, agent state, timers, workspaces,
  links, and version records.
- `.search/` contains rebuildable lexical/semantic indexes and runtime queue
  state.
- `runtime/` contains diagnostics and child-process logs.

This is a hybrid file-based design. It is human-readable and Git-friendly,
but it is not limited to Markdown and it does not use a single relational
database as the primary domain store.

### Concurrency and mutation safety

Storage methods own parsing, serialization, project filtering, and file
placement. Mutation paths use the smallest existing coordination primitive:

- in-process mutexes protect stores such as chats and the active project
  manager;
- cross-process file locks serialize task lifecycle and agent state changes;
- `Store.WithTaskLifecycleTransaction` groups lock-aware lifecycle mutations;
- agent run locks prevent two Codex runs from editing the same project; and
- runtime queue leases prevent duplicate background job ownership.

There is no general database transaction spanning every store. If a change
touches multiple durable entities, use the existing transaction/lock boundary
for that domain and make recovery explicit.

## Core request and data flows

### CLI mutation

```text
knowme task edit ...
        |
        v
  Cobra command and project resolver
        |
        v
  storage.Store -> domain sub-store -> .know-me file(s)
        |
        +-> version history / lifecycle event / derived index when applicable
```

The command layer validates user input and formats output. The storage layer
remains responsible for the file format and ID/project resolution.

### Browser read or mutation

```text
React page or context
        |
   fetch /api/...
        |
Chi route handler -> Store/service -> JSON response
        |
successful mutation -> SSEBroker -> /api/events -> SSEContext -> UI refresh
```

The UI uses one shared `EventSource` per browser tab through
`ui/src/contexts/SSEContext.tsx`. Named events cover tasks, docs, decisions,
timers, chats, agent progress, OpenCode events, runtime services, and full
refreshes. Event payloads are hints for invalidation or targeted upserts; the
API remains authoritative when a page reloads state.

The server also exposes `/ws/chat` for the chat transport used by the current
browser integration. OpenCode's own event stream is forwarded through the
server SSE broker so browser tabs do not each need a separate OpenCode event
connection.

### MCP request

```text
AI agent
  |
  | stdio JSON-RPC
  v
MCPServer -> permission middleware -> handler group
  |                         |
  +-------------------------+
             |
             v
     Store / Search / LSP / runtime services
             |
             +-> audit hook and structured MCP response
```

MCP handlers share project resolution and storage with the other entry points.
When a mutation should appear in the browser, the notify/event path broadcasts
the appropriate SSE refresh or update.

### Search and retrieval

```text
search or retrieve query
        |
        v
  search.Engine
   /          \
keyword/BM25   semantic embeddings + vector store
   \          /
      hybrid ranking
        |
        v
  filters, lifecycle visibility, reference expansion
        |
        v
  SearchResult list or AI ContextPack with citations
```

Keyword search can run without local models. Semantic and hybrid search use
the configured embedding provider and derived vector/index storage. When the
semantic runtime or index is unavailable, hybrid retrieval degrades to
keyword results with runtime metadata; explicitly semantic-only requests fail
instead of silently changing meaning.

Indexing is coordinated through `runtimequeue` when the runtime is enabled.
Tests and selected inline paths can bypass the daemon and use the same engine
in-process.

### Task-scoped Codex

```text
Task detail / agent API
        |
        v
codex.Manager -> AgentStore + ChatStore
        |
        v
ACP child process in the repository workspace
        |
        +-> streamed assistant updates
        +-> AgentRun/workflow state and redacted run log
        +-> SSE: agent progress and chats:* events
```

`AgentStore` owns workflow phases, runs, review comments, dirty-file and
interruption metadata. `ChatStore` owns the readable task conversation. The
ACP process owns the protocol session and tool execution. The server/UI
persists and broadcasts snapshots; raw protocol traffic stays in the run log.

Auto task chat reuses the task's ACP session and is subject to the same
project run lock as gated investigation, implementation, review, fix, and
resume actions. It does not replace the explicit workflow gates.

### OpenCode runtime

OpenCode is an optional project runtime. The server can manage a local daemon
or connect to an external configured server, checks readiness, proxies the
OpenCode API under `/api/opencode`, and forwards OpenCode global events through
Know-Me's SSE stream. If it is disabled or unavailable, the core workspace,
CLI, MCP, and non-OpenCode routes continue to operate.

### LSP runtime

`internal/lsp` owns language adapters, detection, configuration, sessions,
diagnostics, symbols, and edits. `internal/lspdaemon` keeps project-scoped
language servers alive behind a local authenticated RPC protocol. The MCP code
runtime and HTTP LSP routes prefer the daemon when available and can annotate
or fall back to in-process manager status when it is disabled or unavailable.

## Cross-cutting behavior

### Security and permissions

- The browser server supports optional password authentication and token
  access for browser event streams.
- HTTP middleware adds recovery, request IDs, real IP handling, CORS, and
  authentication before resource routes.
- Destructive task operations are capability-gated; hard delete is disabled by
  default and enabled only by a trusted server option.
- MCP tool calls pass through a project-configured permission guard and audit
  lifecycle hooks.
- Child-process commands are passed as executable plus argument arrays rather
  than interpolated shell strings.

### Startup recovery and shutdown

On browser-server startup, stale running workspaces are marked stopped,
streaming chats are marked idle, and stale Codex runs are marked interrupted.
Background monitors track OpenCode readiness, service status, task lifecycle
sweeps, and SSE forwarding. Shutdown cancels monitors, stops runtimes, closes
leases, and removes the server port marker.

### References and graph data

References such as `@doc/...`, `@task-...`, `@memory-...`, and
`@decision-...` are parsed and resolved by shared storage/reference code.
Structural graph edges are derived from entity fields and inline references;
they are not a second manually maintained graph database.

### Testing and verification

Go unit and integration tests live beside their packages. HTTP route contracts,
MCP handlers, storage formats, lifecycle transitions, search behavior, agent
state, and runtime boundaries have focused tests. Browser behavior is covered
by Playwright suites under `ui/e2e/`.

Typical contributor checks are:

```bash
go test ./...
go build -o ./bin/knowme ./cmd/knowme
cd ui && npm run build
```

The repository Makefile wraps the normal build, test, lint, UI, and E2E
commands. Keep code, tests, and documentation aligned when a boundary or
public behavior changes.

## Extension rules

When adding a capability:

1. Put shared data contracts in `internal/models` only when they are consumed
   across boundaries.
2. Put durable reads/writes and file-format knowledge in `internal/storage`.
3. Put business transitions in an existing domain package or service.
4. Add CLI, HTTP, and MCP adapters that call the shared operation; do not
   duplicate the mutation logic in each adapter.
5. Add derived indexing or events only after the durable mutation succeeds.
6. Reuse existing locks, runtime queues, permission guards, and SSE event
   conventions before creating new coordination mechanisms.

For a small feature, the expected path is usually:

```text
models (if needed) -> storage/domain operation -> CLI/API/MCP adapter
                                         -> focused tests -> docs
```

## Evolving areas

These areas are intentionally optional or in active development and should
not be treated as required for the core local workspace:

- managed versus external OpenCode runtime and its browser chat surface;
- task-scoped Codex ACP workflows, Auto chat, review gates, and resume;
- LSP daemon lifecycle, plugin adapters, and language coverage;
- semantic search model/runtime setup and keyword degradation behavior; and
- multi-project registry and workspace switching.

There is no central sync service in the current architecture. Local project
files and the global `~/.know-me` store remain the source of truth; any future
network synchronization would be a separate design.

## Technology summary

| Area | Current implementation |
|---|---|
| Language/runtime | Go 1.24.2 |
| CLI | Cobra, with plain/JSON and interactive output modes |
| HTTP server | `net/http`, Chi middleware/router, embedded static assets |
| Browser UI | React, TypeScript, Vite, Tailwind CSS, Playwright E2E |
| Real-time browser events | Server-Sent Events; WebSocket for chat transport |
| AI tools | MCP over stdio via `mcp-go` |
| Durable project data | Markdown/YAML frontmatter and JSON under `.know-me/` |
| Search | BM25/keyword, semantic embeddings, hybrid retrieval, derived vector/index stores |
| Agent runtimes | Codex ACP and optional OpenCode daemon/server |
| Code intelligence | LSP adapters with a project-scoped LSP daemon |
| Local coordination | File locks, JSON state, runtime queue leases, goroutine monitors |

## Useful starting points

- CLI entry: `cmd/knowme/main.go`, `internal/cli/root.go`
- Core store: `internal/storage/store.go`, `internal/storage/manager.go`
- Browser server: `internal/server/server.go`, `internal/server/routes/router.go`
- MCP bootstrap: `internal/mcp/server.go`, `internal/mcp/handlers/initial.go`
- Search: `internal/search/engine.go`, `internal/search/runtime_search.go`
- Codex: `internal/agents/codex/runner.go`, `internal/agents/codex/workflow.go`, `internal/agents/codex/chat.go`
- OpenCode: `internal/agents/opencode/`
- LSP: `internal/lsp/`, `internal/lspdaemon/`
- UI entry and events: `ui/embed.go`, `ui/src/App.tsx`, `ui/src/contexts/SSEContext.tsx`
- Contributor workflow: `docs/en/contributing/developer-guide.md`
