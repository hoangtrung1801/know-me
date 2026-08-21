<p align="center">
  <img src="./images/logo.png" alt="Know-Me" width="120">
</p>

<h1 align="center">Know-Me</h1>

<p align="center">
  <strong>Your local-first workspace for projects, tasks, saved links, and quick memos.</strong>
</p>

<p align="center">
  <sub>Local-first · Self-hostable · Built for everyday momentum</sub>
</p>

<p align="center">
  <a href="https://knowns.sh">Homepage</a> |
  <a href="./README.vi.md">Tiếng Việt</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./docs/README.md">Documentation</a>
</p>

---

Work is easy to start and hard to keep together. Projects live in one place, tasks in another, useful links disappear into browser tabs, and quick notes get lost in chat history.

**Know-Me brings them together.** Keep your work organized locally, return to it from any project, and use the CLI or web UI when it suits you.

Know-Me is the product name; the existing `knowns` CLI and package names remain unchanged for compatibility.

> **One calm place for the work in front of you—and the things you do not want to forget.**

## Table of Contents

- [Why Know-Me?](#why-know-me)
- [Before & After](#before--after)
- [What is Know-Me?](#what-is-know-me)
- [How It Works](#how-it-works)
- [Core Capabilities](#core-capabilities)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Documentation](#documentation)
- [Development](#development)
- [Links](#links)

## Why Know-Me?

Your work should be easy to find and easy to continue.

- Plan a project without losing its tasks.
- Capture a useful URL before it vanishes into open tabs.
- Write a quick memo without turning it into a document.
- Keep your workspace local-first and under your control.

## Before & After

| Without Know-Me | With Know-Me |
|---|---|
| Tasks are scattered across notes and chat | Projects keep related tasks together |
| Useful pages become forgotten bookmarks | Saved links form one searchable library |
| Quick thoughts disappear before you act on them | Memos capture them in seconds |
| Work context takes time to rebuild | Your workspace is ready when you return |

## What is Know-Me?

Know-Me is a **local-first, self-hostable productivity workspace**. It helps you organize projects and tasks, save useful links, and capture quick notes without giving up control of your data.

Projects provide a home for related work. Saved links and memos are global, so they stay available across every project.

<p align="center">
  <img src="./images/how-knowns-works.png" alt="Know-Me workspace" width="100%">
</p>

## How It Works

1. **Create a project** to organize related work.
2. **Track tasks** and their progress in that project.
3. **Save links and memos** whenever something is worth keeping.
4. **Return to your workspace** through the CLI or web UI.

Simple capture. Clear priorities. Less lost context.

## Core Capabilities

| 🗂️ Projects | ✅ Tasks | 🔗 Saved Links | ✍️ Memos |
|---|---|---|---|
| Give related work a home. | Turn intentions into clear next steps. | Keep useful URLs in one global library. | Catch a thought before it disappears. |

### Try it

```bash
# Start a project workspace
knowns init

# Add a task
knowns task create "Plan launch" --ac "Define the first milestone"

# Save something useful
knowns link add "https://example.com/article"
knowns memo add "Ask Sam about the launch timeline"
```

## Quick Start

Your first session takes five small steps:

1. Install Know-Me.
2. Create or register a project workspace.
3. Add one task you want to finish.
4. Save a useful link and a quick memo.
5. Open the workspace in your browser.

```bash
# Install
brew install knowns-dev/tap/knowns
# or: npm install -g knowns
# or: curl -fsSL https://knowns.sh/script/install | sh

# Create or register a project workspace
mkdir my-project
cd my-project
knowns init

# Add work to the project
knowns task create "Choose a launch date" --ac "Confirm the date"

# Save something useful for later
knowns link add "https://example.com/launch-checklist"
knowns memo add "Review checklist on Friday"

# Open the workspace in your browser
knowns browser --open
```

## Installation

### Homebrew (macOS/Linux)

```bash
brew install knowns-dev/tap/knowns
```

### Shell installer (macOS/Linux)

```bash
curl -fsSL https://knowns.sh/script/install | sh
```

### PowerShell installer (Windows)

```powershell
irm https://knowns.sh/script/install.ps1 | iex
```

### npm

```bash
npm install -g knowns
```

### From source

Requires Go 1.24.2+.

```bash
go install github.com/hoangtrung1801/known-me/cmd/knowns@latest
```

## Documentation

| Guide | Description |
|---|---|
| [User Guide](./docs/en/guides/user-guide.md) | Getting started and daily usage |
| [Command Reference](./docs/en/reference/commands.md) | CLI commands and examples |
| [Web UI](./docs/en/guides/web-ui.md) | Workspace, board, links, and memos |
| [Configuration](./docs/en/reference/configuration.md) | Project settings and options |
| [Developer Guide](./docs/en/contributing/developer-guide.md) | Contributing to Know-Me |

## Development

Requires Go 1.24.2+ and optionally Node.js + pnpm for UI development.

```bash
make build
make test
make test-e2e
make lint
make ui
```

## Links

- [Homepage](https://knowns.sh)
- [npm](https://www.npmjs.com/package/knowns)
- [GitHub](https://github.com/knowns-dev/knowns)
- [Discord](https://discord.knowns.dev)
- [Releases](https://github.com/knowns-dev/knowns/releases)
