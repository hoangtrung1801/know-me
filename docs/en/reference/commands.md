# Command Reference

Use `knowns <command> --help` for the exact syntax accepted by the current binary. This page is the practical reference for the main command groups and how they are typically used.

## Conventions

- Use `--plain` when an AI or script needs text output that is easy to parse.
- Use `--json` when you want structured output.
- Use `knowme sync` when you want generated files and platform artifacts to match the current config.

## Initialize and sync

### `knowme init`

Registers the current workspace as a project, saves its canonical local path,
selects it, initializes the shared Know-Me store, and writes `.known-me.json`
in the current directory. The link contains the generated project ID, so
commands from this directory or its subdirectories use that project. When no
name is provided, the current directory name is used. Projects created through
the project-management API may remain pathless until a workspace is linked.

```bash
knowme init
knowme init my-project --no-wizard
knowme init --force
```

### `knowme setup`

Configures AI tool integrations for an initialized project.

```bash
knowme setup --global        # Interactive user-level platform selector
knowme setup claude --global # Claude user-level MCP/skills/hooks
knowme setup codex --global  # Codex user-level MCP/skills/hooks
knowme setup hermes --global # Hermes user-level MCP/skills config
knowme setup all --global    # All supported platforms at user scope
knowme setup agents          # Lightweight repo-local agent shims only
knowme setup                 # Interactive project-level platform selector
knowme setup claude          # Project-level Claude files
knowme setup codex           # Project-level Codex files
knowme setup hermes          # Project-linked Hermes config and AGENTS.md
```

Use `--global` for normal personal assistant setup. It updates user-level MCP config, skills, and runtime hooks, so the integration follows you across repositories. Use project-level setup only when you intentionally want repo-local platform artifacts.

### `knowme sync`

Re-applies `.know-me/config.json` to the current machine.

```bash
knowme sync
knowme sync --skills
knowme sync --instructions
knowme sync --model
knowme sync --instructions --platform claude
knowme sync --instructions --platform cursor
```

Typical uses:

- after cloning a repo
- after updating Know-Me
- after changing selected platforms
- after changing local generated artifacts manually and wanting to restore them

### `knowme update`

Updates the CLI and syncs project artifacts afterward.

```bash
knowme update
knowme update --check
```

### `knowme settings`

Opens the interactive project settings center.

```bash
knowme settings
knowme settings --global
```

Use `knowme settings` for human-friendly project edits: project name, git tracking, AI platforms, search, code intelligence, Browser/Chat UI, and maintenance guidance. In Search settings, Local ONNX models are listed with downloaded/not downloaded status; selecting a missing model can download it before saving. Use `knowme settings --global` for defaults reused by future `knowme init` runs. Use `knowme config get/set/list/reset` when you need scriptable config access.

## Tasks

### Create

```bash
knowme task create "Title" -d "Description"
knowme task create "Add auth" \
  --ac "User can login" \
  --ac "JWT token returned" \
  --priority high \
  -l auth
```

Common options:

- `-d, --description`
- `--ac`
- `-l, --label`
- `--priority`
- `-a, --assignee`
- `--parent`

### View and list

```bash
knowme task list --plain
knowme task list --status in-progress --assignee @me
knowme task <id> --plain
knowme task view <id> --plain
```

### Edit

```bash
knowme task edit <id> -s in-progress
knowme task edit <id> --check-ac 1
knowme task edit <id> --append-notes "Completed middleware"
knowme task edit <id> --plan $'1. Research\n2. Implement\n3. Test'
```

Common edit operations:

- change title/description
- update status/priority/assignee
- add, check, uncheck, or remove acceptance criteria
- replace or append implementation notes
- set an implementation plan

## Docs

### Create

```bash
knowme doc create "Architecture" -d "System overview" -f architecture
knowme doc create "Auth Pattern" -d "JWT auth pattern" -f patterns -t auth -t security
```

### View and list

```bash
knowme doc list --plain
knowme doc "architecture/auth" --plain
knowme doc "architecture/auth" --info --plain
knowme doc "architecture/auth" --toc --plain
knowme doc "architecture/auth" --section "2" --plain
```

### Edit

```bash
knowme doc edit "architecture/auth" -a "\n\n## Notes\n..."
knowme doc edit "architecture/auth" -c "# New content"
knowme doc edit "architecture/auth" --section "2" -c "## 2. Updated section"
```

## Search, retrieve, and resolve

### Search

```bash
knowme search "authentication" --plain
knowme search "jwt" --type doc --plain
knowme search "jwt" --keyword --plain
knowme search --status-check
knowme search --reindex
```

Modes:

- default: hybrid
- `--keyword`: keyword-only

### Retrieve

```bash
knowme retrieve "how auth works" --json
knowme retrieve "auth flow" --source-types doc,task --json
```

Use retrieve when you want a ranked context pack rather than a flat result list.

### Resolve

```bash
knowme resolve "@doc/specs/auth{implements}" --plain
knowme resolve "@doc/specs/auth{depends}" --direction inbound --depth 2 --plain
```

Use resolve to traverse structural relationships between docs, tasks, and other entities.

## Memory

```bash
knowme memory add "We use repository pattern" --category pattern
knowme memory list --plain
knowme memory <id> --plain
knowme memory edit <id> --append "More detail"
```

Memory is useful for persistent project-level or global patterns, conventions, preferences, and failures that AI should recall later. The `decision` category is legacy and rejected for new writes.

## Decisions

```bash
knowme decision create "Use Postgres for metadata"
knowme decision list --plain
knowme decision get <id> --plain
knowme decision link <id> --source @doc/architecture/storage --task <done-task-id>
knowme decision accept <id>
knowme decision resolve create_draft "Use Postgres for metadata"
knowme decision supersede <old-id> <new-id>

knowme decision migrate preview --plain
knowme decision migrate apply --memory <memory-id> --resolution create_decision
knowme decision migrate rollback <memory-id>
```

Spec Decisions are locked `D1`, `D2`, … implementation rules in an approved spec. The commands above manage System Decisions: durable project choices that start as drafts, require readable sources plus completed task evidence before acceptance, and may later be superseded rather than edited in place.

Legacy Decision Memory migration is preview-first, explicit per record, journaled, and reversible. Supported resolutions are `create_decision`, `link_existing`, `consolidate_duplicate`, `reclassify`, `archive_noise`, `reject_noise`, and `leave_unchanged`; there is no implicit bulk apply.

## Templates

```bash
knowme template list
knowme template get <name>
knowme template run <name>
knowme template create <name>
```

Use templates for repeatable scaffolding and standardized output.

## Code intelligence

### LSP management

```bash
knowme lsp list                    # Show supported languages and their status
knowme lsp install <language>      # Download and install an LSP server
knowme lsp cleanup                 # Remove old LSP server versions
```

Know-Me auto-detects project languages and checks for LSP binaries. If a binary is missing, `knowme lsp list` shows install guidance.

### Code operations (via MCP)

Code intelligence is LSP-based and accessed through the MCP `code` tool:

- `symbols` — list symbols in a file
- `find` — search symbols by name pattern with optional body/depth
- `definition` — go to definition
- `references` — find all references
- `implementations` — find implementations of interface
- `diagnostics` — get compile errors/warnings
- `rename` — rename symbol across workspace
- `replace` — regex/literal text replacement
- `replace_body` — replace entire symbol body
- `insert` — insert code before/after a symbol
- `delete` — safe delete with reference check

### Code index inspection (CLI)

```bash
knowme code symbols --plain
knowme code search "AuthService" --plain
knowme code deps --plain
```

Use CLI code commands for inspecting indexed symbol/dependency data. Use the MCP `code` tool for structured navigation and edits.

## Validation

```bash
knowme validate --plain
knowme validate --scope docs --plain
knowme validate --scope sdd --plain
knowme validate --strict --plain
```

Use validation before considering documentation or workflow changes complete.

## Time tracking

```bash
knowme time start <task-id>
knowme time stop
knowme time add <task-id> 1h30m -n "Pair programming"
knowme time report
```

## Browser UI

```bash
knowme browser
knowme browser --open
knowme browser --port 6421
```

## Project status and audit

```bash
knowme status
knowme audit recent
knowme audit stats
```

Use `status` for project readiness and `audit` to inspect recent MCP tool calls.

## Agent and guidance files

```bash
knowme setup
knowme sync --skills
knowme sync --instructions
```

Use `knowme setup` to generate AI integration files, or `knowme sync` to refresh them.

## Model management

```bash
knowme model add <model-name>
knowme model list
knowme model download multilingual-e5-small
knowme model set multilingual-e5-small
knowme model status
knowme model remove <id>
```

## Providers and runtime adapters

```bash
knowme provider list
knowme provider add --id openai --name "OpenAI" --api-base https://api.openai.com/v1 --api-key <key>
knowme provider test <id>
knowme provider remove <id>

knowme runtime status
knowme runtime install codex
knowme runtime ps
knowme runtime logs
knowme runtime stop
knowme runtime uninstall codex

knowme runtime-memory hook
knowme runtime-memory hook --json
```

Use providers for API-backed embedding providers. Use runtime commands to install and inspect runtime memory adapters and the shared runtime.

The default hook output is plain prompt context for runtime adapters. Each injected memory includes inline score/trust metadata, for example `score=0.92; trust=active`, so the assistant can weigh supplemental context.

Use `knowme runtime-memory hook --json` when a caller needs structured metadata instead of prompt text. JSON output includes retrieval item scores and capture trust metadata such as `capture.score`, `capture.threshold`, `capture.trusted`, and review `capture.matches` when review is required.

## Tunnels

```bash
knowme tunnel status
knowme tunnel stop
```

Use tunnel commands to inspect or stop Cloudflare Quick Tunnels created for local server sharing.

## Imports

```bash
knowme import add <name> <source>
knowme import sync
knowme import list
```

Use imports when you want to bring in docs or templates from git, local, or package sources.
