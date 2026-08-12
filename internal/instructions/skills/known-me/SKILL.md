---
name: known-me
description: Use when working in a Know-Me-managed project and needing to discover, inspect, or operate any Know-Me CLI command, task, document, template, memory, decision, search, validation, setup, or runtime workflow.
---

# Know-Me CLI

Use the CLI only; do not use Know-Me MCP tools.

## Start

Run these read-only checks from the project root:

```bash
knowns doctor --plain
knowns memory list --plain
knowns --help
```

Treat `knowns --help` as the complete, version-correct command index. Before using any command or nested command whose flags are not already known, run:

```bash
knowns <command> --help
knowns <command> <subcommand> --help
```

Prefer `--json` for agent parsing and `--plain` for human-facing output. Search before reading: `knowns search "<query>" --plain`; retrieve structured context with `knowns retrieve "<query>" --json`.

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

## Capture routing

When asked to add a record to Know-Me, choose the smallest matching record type:

| Input | Create |
| --- | --- |
| Quick note, idea, or other short item | Memo: `knowns memo add "<content>"` |
| Work or a task to track | Task: `knowns task create "<title>" --ac "<acceptance criteria>"` |
| A URL or link | Link: `knowns link add <url>` |

## Tasks

Use tasks for bounded, traceable work. Inspect first with `knowns task list --plain` and `knowns task <id> --plain`; create with a title and acceptance criteria, then update status, assignee, plan, notes, or criteria through `knowns task edit <id> --help`. Use `history` before resolving disputed changes. Archive completed or inactive work; use `hard-delete` only after confirming the exact ID and recovery is unnecessary.

```bash
knowns task create "Add login" --ac "Users can sign in"
knowns task edit <id> -s in-progress
knowns task edit <id> --check-ac 1
```

## Links

Links are global saved URLs, not project docs. Use `knowns link add <url>` to capture one, `knowns link list --json` to find its ID, and `knowns link update <id> --help` to correct metadata or replace its image. There is no link delete command; do not invent one.

## Memos

Memos are short global scratch notes, separate from durable project `memory` records. Use `knowns memo add "<content>"`, `knowns memo list --search "<query>"`, and `knowns memo update <id> "<content>"`. Confirm the ID before `knowns memo delete <id>`.

## Projects

A project is the current working directory registered by `knowns init`; there is no separate `project` command. Run `knowns status --plain` to identify the active project and readiness, `knowns doctor --plain` to diagnose it, and `knowns init` only to initialize or register the current directory. Use `knowns settings` for interactive project settings and `knowns config <get|set|list|reset> --help` for scriptable configuration. Run `knowns sync` after changing bundled or integration artifacts.

Never edit Know-Me-managed task or document Markdown directly. Use the matching CLI command, preview destructive or bulk operations when available, and run `knowns validate --plain` after changes.
