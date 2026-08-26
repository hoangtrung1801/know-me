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
  <a href="https://knowns.sh">Homepage</a> ·
  <a href="./docs/en/README.md">Documentation</a> ·
  <a href="./README.vi.md">Tiếng Việt</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

Know-Me gives a project one durable context layer for humans and AI. Keep
tasks, documentation, decisions, memories, templates, and references close to
the code, then find them through the CLI, Web UI, or MCP.

The product is called **Know-Me**. The command-line interface is `knownme`;
package, repository, and integration identifiers remain `knowns` for
distribution compatibility.

## Why Know-Me?

AI works better when project context is explicit instead of trapped in chat
history. Know-Me makes that context readable, searchable, versionable, and
available to every interface:

| Capability | What it provides |
|---|---|
| **Project context** | Tasks, docs, decisions, memory, templates, and references |
| **Local-first storage** | Human-readable project data in `.known-me/`, suitable for Git |
| **Search and retrieval** | Keyword, hybrid, semantic, and reference-aware context lookup |
| **Code intelligence** | Indexed symbols, dependencies, references, and code search |
| **AI integration** | MCP tools, platform setup, skills, and runtime workflows |
| **Workspace features** | Global projects, saved links, memos, time tracking, and a Web UI |

## How it works

Know-Me is one Go application with three entry points:

- **CLI** — scriptable commands for managing project context.
- **Web UI** — a local browser workspace for browsing, editing, boards, graphs,
  and chat workflows.
- **MCP server** — structured tools for AI agents using the same storage and
  domain services as the CLI and Web UI.

Project data lives in the repository's `.known-me/` directory. Global data such
as the project registry, saved links, memos, and global memory lives in the
user's `~/.known-me/` directory. Markdown is used for durable knowledge such as
tasks, docs, decisions, and memories; JSON stores configuration and runtime
state; search indexes are derived and rebuildable.

## Quick start

Install the CLI, then initialize the repository you want Know-Me to manage:

```bash
# Choose one installation method
brew install knowns-dev/tap/knowns
# or: npm install -g knowns
# or: curl -fsSL https://knowns.sh/script/install | sh

cd your-project
knownme init
```

Create project context and verify it:

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

Configure the platform you use:

```bash
# User-level setup for a platform
knownme setup codex --global
knownme setup claude --global

# Repository-local compatibility guidance
knownme setup agents
```

At the beginning of an AI session, the Know-Me MCP server exposes `initial`
for project operating context. Use `help` when an agent needs detailed tool
schemas or workflow guidance. Run `knownme sync` after changing platform
configuration or updating the CLI.

See the [AI Agent Guide](./docs/en/guides/ai-agent-guide.md),
[AI Workflow](./docs/en/guides/ai-workflow.md), and
[MCP integration guide](./docs/en/guides/mcp-integration.md).

## Installation

### Homebrew

```bash
brew install knowns-dev/tap/knowns
```

### npm

```bash
npm install -g knowns
```

### Shell installer

```bash
curl -fsSL https://knowns.sh/script/install | sh
```

### PowerShell installer

```powershell
irm https://knowns.sh/script/install.ps1 | iex
```

### From source

Requires Go 1.24.2 or later:

```bash
go install github.com/hoangtrung1801/known-me/cmd/knownme@latest
# or, from this repository:
go build -o ./bin/knownme ./cmd/knownme
```

Verify an installation with:

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

Use `knownme [command] --help` for command-specific options. Most commands
support `--plain` for readable automation output and `--json` for structured
output.

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

## Development

Requirements:

- Go 1.24.2 or later
- Bun for UI development and builds
- Docker for runtime and stress-test targets

Useful targets from the repository root:

```bash
make all             # Build the UI and CLI
make build           # Build the current-platform CLI
make test            # Run the Go test suite with the race detector
make lint            # Run golangci-lint
make test-e2e        # Run CLI and MCP end-to-end tests
make test-e2e-ui     # Run UI end-to-end tests
make dev-go          # Run the Go server with hot reload
make dev-ui          # Run the Vite UI development server
```

For contributor conventions and the deeper system design, start with the
[Developer Guide](./docs/en/contributing/developer-guide.md) and
[Architecture](./ARCHITECTURE.md).

## Links

- [Homepage](https://knowns.sh)
- [GitHub](https://github.com/hoangtrung1801/known-me)
- [npm](https://www.npmjs.com/package/knowns)
- [Discord](https://discord.knowns.dev)
- [Releases](https://github.com/hoangtrung1801/known-me/releases)
