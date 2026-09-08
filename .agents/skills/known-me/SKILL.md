---
name: known-me
description: Use when working in a Know-Me-managed project and needing to discover, inspect, or operate any Know-Me CLI command, task, document, template, memory, decision, search, validation, setup, or runtime workflow.
---

# Know-Me CLI

Use the CLI only; do not use Know-Me MCP tools.

## Start

Run these read-only checks from the project root:

```bash
knownme doctor --plain
knownme memory list --plain
knownme --help
```

Treat `knownme --help` as the complete, version-correct command index. Before using any command or nested command whose flags are not already known, run:

```bash
knownme <command> --help
knownme <command> <subcommand> --help
```

Prefer `--json` for agent parsing and `--plain` for human-facing output. Search before reading: `knownme search "<query>" --plain`; retrieve structured context with `knownme retrieve "<query>" --json`.

## Command map

| Need | CLI |
| --- | --- |
| Project health or current state | `doctor`, `status`, `validate` |
| Work items | `task` |
| Project knowledge | `doc`, `search`, `retrieve`, `template` |
| Durable agent knowledge | `memory`, `decision` |
| Planning and tracking | `time`, `board`, `audit` |
| Project or agent setup | `init`, `setup`, `config`, `settings`, `sync`, `agents` |
| Local models, language servers, integrations | `model`, `lsp`, `provider`, `browser`, `runtime`, `tunnel`, `update` |
| Source navigation and edits | `code` |

## Tasks

Use tasks for bounded, traceable work. Inspect first with `knownme task list --plain` and `knownme task <id> --plain`; create with a title and acceptance criteria, then update status, assignee, plan, notes, or criteria through `knownme task edit <id> --help`. Use `history` before resolving disputed changes. Archive completed or inactive work; use `hard-delete` only after confirming the exact ID and recovery is unnecessary.

```bash
knownme task create "Add login" --ac "Users can sign in"
knownme task edit <id> -s in-progress
knownme task edit <id> --check-ac 1
```

## Links

Links are global saved URLs, not project docs. Use `knownme link add <url>` to capture one, `knownme link list --json` to find its ID, and `knownme link update <id> --help` to correct metadata or replace its image. There is no link delete command; do not invent one.

## Memos

Memos are short global scratch notes, separate from durable project `memory` records. Use `knownme memo add "<content>"`, `knownme memo list --search "<query>"`, and `knownme memo update <id> "<content>"`. Confirm the ID before `knownme memo delete <id>`.

## Projects

A project is the current working directory registered by `knownme init`; there is no separate `project` command. Run `knownme status --plain` to identify the active project and readiness, `knownme doctor --plain` to diagnose it, and `knownme init` only to initialize or register the current directory. Use `knownme settings` for interactive project settings and `knownme config <get|set|list|reset> --help` for scriptable configuration. Run `knownme sync` after changing bundled or integration artifacts.

Never edit Know-Me-managed task or document Markdown directly. Use the matching CLI command, preview destructive or bulk operations when available, and run `knownme validate --plain` after changes.
