<p align="center">
  <img src="./images/logo.png" alt="Know-Me" width="120">
</p>

<h1 align="center">Know-Me</h1>

<p align="center">
  <strong>The memory layer for AI-native software development.</strong>
</p>

<p align="center">
  <sub>Local-first · File-based · Built for developers and AI agents</sub>
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

Know-Me gives a project one durable context layer for humans and AI. Keep
tasks, docs, decisions, memories, templates, and references close to the code,
then find them through the CLI, Web UI, or MCP.

The product is called **Know-Me**. The command-line interface is `knownme`.
The npm package keeps the name `knowns` for distribution compatibility.

<p align="center">
  <img src="./images/how-knowns-works.png" alt="Know-Me workspace" width="100%">
</p>

## Why Know-Me?

AI works better when project context is explicit instead of trapped in chat
history. Know-Me makes that context readable, searchable, versionable, and
available to every interface:

| Capability | What it provides |
|---|---|
| **Project context** | Tasks, docs, decisions, memory, templates, and references |
| **Local-first storage** | Human-readable data in `.known-me/`, commits cleanly with Git |
| **Search and retrieval** | Keyword, hybrid, semantic, and reference-aware lookup |
| **Code intelligence** | Indexed symbols, dependencies, references, and code search |
| **AI integration** | MCP server, platform setup, skills, and runtime workflows |
| **Workspace** | Project registry, boards, graphs, chat, links, memos, time tracking |

See [Philosophy](./PHILOSOPHY.md) for the design principles behind this.

## How it works

One Go application, three entry points over the same storage and domain services:

- **CLI** — scriptable commands for managing project context.
- **Web UI** — local browser workspace for boards, docs, graphs, and chat.
- **MCP server** — structured tools for AI agents (`initial` + `help` entry points).

Storage layout:

- `<repo>/.known-me/` — project data: tasks, docs, decisions, memories (Markdown + JSON, Git-friendly).
- `~/.known-me/` — global data: project registry, saved links, memos, global memory.
- Search indexes are derived and rebuildable; delete them any time.

## Quick start

```bash
cd your-project
knownme init
```

```bash
# Plan work
knownme task create "Set up the release" -d "Prepare the first release checklist"

# Record durable knowledge
knownme doc create "Architecture" -d "System overview" -f architecture

# Find and validate context
knownme search "architecture" --plain
knownme retrieve "release" --json
knownme validate --plain

# Open the local workspace
knownme browser --open
```

## Connect an AI agent

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
| `knownme doc ...` | Create and manage project documentation |
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
