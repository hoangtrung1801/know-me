# Command Reference

Use `knowns <command> --help` for the exact syntax accepted by the current binary. This page is the practical reference for the main command groups and how they are typically used.

## Conventions

- Use `--plain` when an AI or script needs text output that is easy to parse.
- Use `--json` when you want structured output.
- Use `knownme sync` when you want generated files and platform artifacts to match the current config.

## Initialize and sync

### `knownme init`

Registers the current workspace as a project, saves its canonical local path,
selects it, initializes the shared Know-Me store, and writes `.known-me.json`
in the current directory. The link contains the generated project ID, so
commands from this directory or its subdirectories use that project. When no
name is provided, the current directory name is used. Projects created through
the project-management API may remain pathless until a workspace is linked.

```bash
knownme init
knownme init my-project --no-wizard
knownme init --force
```

### `knownme setup`

Configures AI tool integrations for an initialized project.

```bash
knownme setup --global        # Interactive user-level platform selector
knownme setup claude --global # Claude user-level MCP/skills/hooks
knownme setup codex --global  # Codex user-level MCP/skills/hooks
knownme setup hermes --global # Hermes user-level MCP/skills config
knownme setup all --global    # All supported platforms at user scope
knownme setup agents          # Lightweight repo-local agent shims only
knownme setup                 # Interactive project-level platform selector
knownme setup claude          # Project-level Claude files
knownme setup codex           # Project-level Codex files
knownme setup hermes          # Project-linked Hermes config and AGENTS.md
```

Use `--global` for normal personal assistant setup. It updates user-level MCP config, skills, and runtime hooks, so the integration follows you across repositories. Use project-level setup only when you intentionally want repo-local platform artifacts.

### `knownme sync`

Re-applies `.know-me/config.json` to the current machine.

```bash
knownme sync
knownme sync --skills
knownme sync --instructions
knownme sync --model
knownme sync --instructions --platform claude
knownme sync --instructions --platform cursor
```

Typical uses:

- after cloning a repo
- after updating Know-Me
- after changing selected platforms
- after changing local generated artifacts manually and wanting to restore them

### `knownme update`

Updates the CLI and syncs project artifacts afterward.

```bash
knownme update
knownme update --check
```

### `knownme settings`

Opens the interactive project settings center.

```bash
knownme settings
knownme settings --global
```

Use `knownme settings` for human-friendly project edits: project name, git tracking, AI platforms, search, code intelligence, Browser/Chat UI, and maintenance guidance. In Search settings, Local ONNX models are listed with downloaded/not downloaded status; selecting a missing model can download it before saving. Use `knownme settings --global` for defaults reused by future `knownme init` runs. Use `knownme config get/set/list/reset` when you need scriptable config access.

## Tasks

### Create

```bash
knownme task create "Title" -d "Description"
knownme task create "Add auth" \
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
knownme task list --plain
knownme task list --status in-progress --assignee @me
knownme task <id> --plain
knownme task view <id> --plain
```

### Edit

```bash
knownme task edit <id> -s in-progress
knownme task edit <id> --check-ac 1
knownme task edit <id> --append-notes "Completed middleware"
knownme task edit <id> --plan $'1. Research\n2. Implement\n3. Test'
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
knownme doc create "Architecture" -d "System overview" -f architecture
knownme doc create "Auth Pattern" -d "JWT auth pattern" -f patterns -t auth -t security
```

### View and list

```bash
knownme doc list --plain
knownme doc "architecture/auth" --plain
knownme doc "architecture/auth" --info --plain
knownme doc "architecture/auth" --toc --plain
knownme doc "architecture/auth" --section "2" --plain
```

### Edit

```bash
knownme doc edit "architecture/auth" -a "\n\n## Notes\n..."
knownme doc edit "architecture/auth" -c "# New content"
knownme doc edit "architecture/auth" --section "2" -c "## 2. Updated section"
```

## Search, retrieve, and resolve

### Search

```bash
knownme search "authentication" --plain
knownme search "jwt" --type doc --plain
knownme search "jwt" --keyword --plain
knownme search --status-check
knownme search --reindex
```

Modes:

- default: hybrid
- `--keyword`: keyword-only

### Retrieve

```bash
knownme retrieve "how auth works" --json
knownme retrieve "auth flow" --source-types doc,task --json
```

Use retrieve when you want a ranked context pack rather than a flat result list.

### Resolve

```bash
knownme resolve "@doc/specs/auth{implements}" --plain
knownme resolve "@doc/specs/auth{depends}" --direction inbound --depth 2 --plain
```

Use resolve to traverse structural relationships between docs, tasks, and other entities.

## Memory

```bash
knownme memory add "We use repository pattern" --category pattern
knownme memory list --plain
knownme memory <id> --plain
knownme memory edit <id> --append "More detail"
```

Memory is useful for persistent project-level or global patterns, conventions, preferences, and failures that AI should recall later. The `decision` category is legacy and rejected for new writes.

## Decisions

```bash
knownme decision create "Use Postgres for metadata"
knownme decision list --plain
knownme decision get <id> --plain
knownme decision link <id> --source @doc/architecture/storage --task <done-task-id>
knownme decision accept <id>
knownme decision resolve create_draft "Use Postgres for metadata"
knownme decision supersede <old-id> <new-id>

knownme decision migrate preview --plain
knownme decision migrate apply --memory <memory-id> --resolution create_decision
knownme decision migrate rollback <memory-id>
```

Spec Decisions are locked `D1`, `D2`, … implementation rules in an approved spec. The commands above manage System Decisions: durable project choices that start as drafts, require readable sources plus completed task evidence before acceptance, and may later be superseded rather than edited in place.

Legacy Decision Memory migration is preview-first, explicit per record, journaled, and reversible. Supported resolutions are `create_decision`, `link_existing`, `consolidate_duplicate`, `reclassify`, `archive_noise`, `reject_noise`, and `leave_unchanged`; there is no implicit bulk apply.

## Templates

```bash
knownme template list
knownme template get <name>
knownme template run <name>
knownme template create <name>
```

Use templates for repeatable scaffolding and standardized output.

## Code intelligence

### LSP management

```bash
knownme lsp list                    # Show supported languages and their status
knownme lsp install <language>      # Download and install an LSP server
knownme lsp cleanup                 # Remove old LSP server versions
```

Know-Me auto-detects project languages and checks for LSP binaries. If a binary is missing, `knownme lsp list` shows install guidance.

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
knownme code symbols --plain
knownme code search "AuthService" --plain
knownme code deps --plain
```

Use CLI code commands for inspecting indexed symbol/dependency data. Use the MCP `code` tool for structured navigation and edits.

## Validation

```bash
knownme validate --plain
knownme validate --scope docs --plain
knownme validate --scope sdd --plain
knownme validate --strict --plain
```

Use validation before considering documentation or workflow changes complete.

## Time tracking

```bash
knownme time start <task-id>
knownme time stop
knownme time add <task-id> 1h30m -n "Pair programming"
knownme time report
```

## Browser UI

```bash
knownme browser
knownme browser --open
knownme browser --port 6421
```

## Project status and audit

```bash
knownme status
knownme audit recent
knownme audit stats
```

Use `status` for project readiness and `audit` to inspect recent MCP tool calls.

## Agent and guidance files

```bash
knownme setup
knownme sync --skills
knownme sync --instructions
```

Use `knownme setup` to generate AI integration files, or `knownme sync` to refresh them.

## Model management

```bash
knownme model add <model-name>
knownme model list
knownme model download multilingual-e5-small
knownme model set multilingual-e5-small
knownme model status
knownme model remove <id>
```

## Providers and runtime adapters

```bash
knownme provider list
knownme provider add --id openai --name "OpenAI" --api-base https://api.openai.com/v1 --api-key <key>
knownme provider test <id>
knownme provider remove <id>

knownme runtime status
knownme runtime install codex
knownme runtime ps
knownme runtime logs
knownme runtime stop
knownme runtime uninstall codex

knownme runtime-memory hook
knownme runtime-memory hook --json
```

Use providers for API-backed embedding providers. Use runtime commands to install and inspect runtime memory adapters and the shared runtime.

The default hook output is plain prompt context for runtime adapters. Each injected memory includes inline score/trust metadata, for example `score=0.92; trust=active`, so the assistant can weigh supplemental context.

Use `knownme runtime-memory hook --json` when a caller needs structured metadata instead of prompt text. JSON output includes retrieval item scores and capture trust metadata such as `capture.score`, `capture.threshold`, `capture.trusted`, and review `capture.matches` when review is required.

## Tunnels

```bash
knownme tunnel status
knownme tunnel stop
```

Use tunnel commands to inspect or stop Cloudflare Quick Tunnels created for local server sharing.

## Imports

```bash
knownme import add <name> <source>
knownme import sync
knownme import list
```

Use imports when you want to bring in docs or templates from git, local, or package sources.
