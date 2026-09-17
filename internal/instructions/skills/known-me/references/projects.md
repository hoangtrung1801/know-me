# Projects and setup

## Establish scope before writing

A project is a working directory registered with Know-Me through `knowme init`; there is no separate `project` command. Run project-scoped commands from the intended directory.

1. Run `knowme status --plain` to inspect active project identity and readiness.
2. If identity is blank, unexpected, or configuration is missing, run `knowme doctor --plain`. Do not treat a successful exit alone as proof of a valid project.
3. Resolve the intended project from the user's request and available project context. If multiple targets remain plausible, ask which one. Do not invent an ID or silently use the current directory.
4. Use `knowme init` only when the user intends to initialize/register that directory. Initialization is not a read-only repair step.

Task creation supports `--project-id`; see [Tasks](tasks.md). Global links and memos do not require project initialization.

## Discover configuration and runtime operations

Use the installed command's help before choosing flags or changing configuration:

| Need | Commands |
| --- | --- |
| Readiness, diagnosis, integrity | `status`, `doctor`, `validate` |
| Initialize and configure | `init`, `config`, `settings` |
| Agent integrations and bundled artifacts | `setup`, `agents`, `sync` |
| Embeddings and semantic search | `model`, `provider` |
| Source intelligence and language servers | `code`, `lsp` |
| UI and runtime adapters | `browser`, `runtime` |
| Imported packages and semantic references | `import`, `resolve` |
| Quality gates and audit trail | `eval`, `audit` |
| Network exposure and upgrades | `tunnel`, `update` |

`settings` is interactive; `config` provides scriptable configuration. Use `sync` when intentionally applying changes to bundled/integration artifacts, not after every record edit. Do not install models, expose a tunnel, change providers, or upgrade the CLI without authorization for that operation.
