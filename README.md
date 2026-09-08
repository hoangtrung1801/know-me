<p align="center">
  <img src="./images/logo.png" alt="Know-Me" width="120">
</p>

<h1 align="center">Know-Me</h1>

<p align="center">
  <strong>Your personal database for everything you collect.</strong>
</p>

<p align="center">
  <sub>Local-first · File-based · Tasks · Docs · Memos · Links · AI-searchable</sub>
</p>

<p align="center">
  <a href="https://github.com/hoangtrung1801/know-me/actions/workflows/ci.yml"><img src="https://github.com/hoangtrung1801/know-me/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/hoangtrung1801/know-me/releases"><img src="https://img.shields.io/github/v/release/hoangtrung1801/know-me?color=blue" alt="Release"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/Go-%3E%3D1.24.2-00ADD8?logo=go" alt="Go Version">
  <a href="https://www.npmjs.com/package/knowns"><img src="https://img.shields.io/npm/v/knowns?color=crimson&logo=npm" alt="npm"></a>
</p>

<p align="center">
  <a href="https://knowns.sh">Homepage</a> ·
  <a href="./docs/en/README.md">Documentation</a> ·
  <a href="./README.vi.md">Tiếng Việt</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

Know-Me is a personal database for everything you have and collect. Tasks,
project docs, quick memos, saved links, decisions, and memories live in one
centralized, local-first place — then AI helps you collect, search, and add
context to what's around them.

The product is called **Know-Me**. The command-line interface is `knownme`.
The npm package keeps the name `knowns` for distribution compatibility.

<p align="center">
  <img src="./images/how-knowns-works.png" alt="Know-Me workspace" width="100%">
</p>

## What you keep in Know-Me

| Database | What it holds |
|---|---|
| **Projects** | Centralized home per project; every task, doc, and decision links back to one |
| **Tasks & Kanban** | Planned work with status, acceptance criteria, notes; `board` renders the Kanban view |
| **Documents** | Durable project knowledge — specs, architecture, onboarding, journals |
| **Memos** | Fast global notes and captures, no project required |
| **Links** | Saved URLs with metadata for reading later or referencing from tasks/docs |
| **Memory & Decisions** | Reusable conventions plus recorded system decisions with evidence |

Everything is human-readable on disk (Markdown + JSON), versionable with Git,
and searchable from any interface. See [Philosophy](./PHILOSOPHY.md) for why.

## Collect with AI, search with context

AI is a collection and recall assistant, not a black box:

- **Collect** — capture a memo, link, task, or doc from the CLI, Web UI, or an agent; Know-Me files it in the right database.
- **Search** — keyword, hybrid, semantic, and reference-aware lookup across tasks, docs, memories, and decisions.
- **Enrich** — `retrieve` pulls ranked context for the thing you're working on, so agents and humans see surrounding decisions, docs, and code references instead of guessing.

Nothing important lives only in chat history. If it's worth keeping, it goes
in the database with a reference (`@doc/<path>`, `@task/<id>`) that resolves
to the exact source every time.

## How it works

One Go application, three entry points over the same storage and domain services:

- **CLI** — scriptable capture and management (`task`, `doc`, `memo`, `link`, `board`, `search`).
- **Web UI** — local browser workspace for Kanban boards, docs, graphs, and chat workflows.
- **MCP server + skills** — agents connect straight to your personal database via structured MCP tools and skills (see below).

Storage layout:

- `<repo>/.know-me/` — project database: tasks, docs, decisions, memories (Markdown + JSON, Git-friendly).
- `~/.know-me/` — personal database: project registry, saved links, memos, global memory.
- Search indexes are derived and rebuildable; delete them any time.

## Quick start

```bash
cd your-project
knownme init
```

```bash
# Capture fleeting notes and links — no project ceremony needed
knownme memo add "Idea: weekly review every Friday"
knownme link add https://example.com/article

# Manage a project: tasks on a Kanban board
knownme task create "Set up the release" -d "Prepare the first release checklist"
knownme board

# Record durable knowledge
knownme doc create "Architecture" -d "System overview" -f architecture

# Search everything, then validate the database
knownme search "release" --plain
knownme retrieve "release" --json
knownme validate --plain

# Open the visual workspace
knownme browser --open
```

## Connect an AI agent

Agents read and write the same personal database you use — via MCP tools and
skills, not copy-pasted chat logs:

```bash
# User-level setup for a platform
knownme setup codex --global
knownme setup claude --global

# Repository-local compatibility guidance
knownme setup agents
```

At the start of an AI session, the MCP server exposes `initial` for project
operating context. Use `help` when an agent needs detailed tool schemas. Run
`knownme sync` after changing platform configuration or updating the CLI.

See the [AI Agent Guide](./docs/en/guides/ai-agent-guide.md),
[AI Workflow](./docs/en/guides/ai-workflow.md), and
[MCP integration guide](./docs/en/guides/mcp-integration.md).

## Installation

### npm

```bash
npm install -g knowns
```

### Shell installer (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.sh | sh
```

### PowerShell installer (Windows)

```powershell
irm https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.ps1 | iex
```

### From source

Requires Go 1.24.2 or later:

```bash
git clone https://github.com/hoangtrung1801/know-me.git
cd know-me
make all
./bin/knownme --version
```

Verify any installation with:

```bash
knownme --version
```

## Common commands

| Command | Purpose |
|---|---|
| `knownme init` | Initialize or register a project |
| `knownme task ...` | Create and manage planned work |
| `knownme board` | Show the Kanban board |
| `knownme doc ...` | Create and manage project documentation |
| `knownme memo ...` | Capture and list fast global notes |
| `knownme link ...` | Save and list links for later |
| `knownme memory ...` | Store reusable project or global context |
| `knownme decision ...` | Record and review system decisions |
| `knownme search ...` | Search tasks, docs, memories, and decisions |
| `knownme retrieve ...` | Retrieve ranked context for an AI workflow |
| `knownme code ...` | Inspect indexed symbols and dependencies |
| `knownme validate` | Check project structure and configuration |
| `knownme browser` | Start or open the local Web UI |
| `knownme setup ...` | Configure agent platforms and integrations |
| `knownme sync` | Apply project configuration and generated artifacts |

`knownme [command] --help` shows command-specific options. Most commands
support `--plain` for automation-friendly output and `--json` for structured
output.

Full reference: [Commands](./docs/en/reference/commands.md).

## Documentation

- [Documentation index](./docs/en/README.md)
- [Installation](./docs/en/getting-started/installation.md)
- [Quick start](./docs/en/getting-started/quick-start.md)
- [User guide](./docs/en/guides/user-guide.md)
- [Task management](./docs/en/guides/task-management.md)
- [Web UI](./docs/en/guides/web-ui.md)
- [AI Agent Guide](./docs/en/guides/ai-agent-guide.md)
- [MCP integration](./docs/en/guides/mcp-integration.md)
- [Command reference](./docs/en/reference/commands.md)
- [Configuration](./docs/en/reference/configuration.md)
- [Semantic search](./docs/en/reference/semantic-search.md)
- [Architecture](./ARCHITECTURE.md)
- [Philosophy](./PHILOSOPHY.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## Development

Requirements:

- Go 1.24.2 or later
- Bun for UI development and builds
- Docker for runtime and stress-test targets

```bash
make all             # Build the UI and CLI
make build           # Build the current-platform CLI
make test            # Go test suite with the race detector
make lint            # golangci-lint
make test-e2e        # CLI and MCP end-to-end tests
make test-e2e-ui     # UI end-to-end tests
make dev-go          # Go server with hot reload
make dev-ui          # Vite UI development server
```

Start with the [Developer Guide](./docs/en/contributing/developer-guide.md)
and [Architecture](./ARCHITECTURE.md). Contributions follow
[CONTRIBUTING.md](./CONTRIBUTING.md) under the MIT license.

## Links

- [Homepage](https://knowns.sh)
- [GitHub](https://github.com/hoangtrung1801/know-me)
- [npm](https://www.npmjs.com/package/knowns)
- [Discord](https://discord.knowns.dev)
- [Releases](https://github.com/hoangtrung1801/know-me/releases)
