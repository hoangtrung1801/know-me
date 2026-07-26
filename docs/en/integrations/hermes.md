# Hermes Agent

Use Hermes Agent with Knowns through MCP, `AGENTS.md`, and optional Knowns skills.

Hermes reads project context files such as `AGENTS.md`, supports MCP servers through `~/.hermes/config.yaml`, and can scan external skill directories. Knowns uses those three surfaces together:

- `AGENTS.md` tells Hermes to start with Knowns MCP `initial` and use `help("tool.*")` or `help("workflow.*")` on demand.
- `knowns mcp --stdio` exposes Knowns tools for tasks, docs, memory, search, code, templates, and validation.
- `.agents/skills` exposes Knowns workflow skills such as `kn-research`, `kn-plan`, `kn-flow`, and `kn-review` when Hermes scans it as an external skill directory.

Hermes references:

- [Use MCP with Hermes](https://hermes-agent.nousresearch.com/docs/guides/use-mcp-with-hermes)
- [MCP Config Reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
- [Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)
- [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)

## Recommended setup

From a Knowns project:

```bash
knowns init
knowns setup hermes
```

Hermes stores MCP settings in `~/.hermes/config.yaml`, so even project setup writes to a user-level Hermes config file. The project remains scoped because Knowns writes `--project <this-repo>` into the MCP server args.

`knowns setup hermes` creates or refreshes:

- `AGENTS.md`
- `KNOWNS.md`
- `.agents/skills`
- `~/.hermes/config.yaml`

The Hermes config points the Knowns MCP server at the current project with `--project`, so Hermes can launch from another directory and still use the right Knowns store. Running `knowns setup hermes` from another project updates the same `mcp_servers.knowns` entry to that project.

Use global setup if you want Hermes to know about Knowns on every machine-level Hermes session:

```bash
knowns setup hermes --global
```

Global setup writes `~/.hermes/config.yaml` with a reusable `knowns mcp --stdio` server and `~/.agents/skills` as an external skill directory. This mode does not pin a project; Knowns resolves the active project from the Hermes working directory or from MCP project selection.

## Manual config

If you prefer to configure Hermes manually, add this to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  knowns:
    command: "knowns"
    args: ["mcp", "--stdio", "--project", "/absolute/path/to/project"]

skills:
  external_dirs:
    - /absolute/path/to/project/.agents/skills
```

If `knowns` is not installed globally, use `npx` instead:

```yaml
mcp_servers:
  knowns:
    command: "npx"
    args: ["-y", "knowns", "mcp", "--stdio", "--project", "/absolute/path/to/project"]
```

## Start Hermes

Run Hermes from the project:

```bash
hermes chat
```

Ask Hermes to verify the MCP tools:

```text
Tell me which MCP-backed tools are available right now.
```

Then ask it to start with Knowns:

```text
Call Knowns MCP initial, then use help("workflow.*") if you need workflow details.
```

## Working model

Hermes should treat Knowns as the project working layer:

- call MCP `initial` at the start of a session
- use `search` before reading broad project context
- use `docs`, `tasks`, `memory`, `templates`, and `validate` through MCP when available
- use `code` tools for code discovery and structural edits when available
- fall back to `knowns` CLI commands only when MCP is unavailable

Skills are not MCP tools. MCP tools appear as structured tools from the `knowns` MCP server; skills appear as Hermes slash commands when Hermes indexes the configured `external_dirs`.

## Troubleshooting

- If Hermes cannot see Knowns tools, restart Hermes or run `/reload-mcp`.
- If the MCP server starts in the wrong project, use `knowns setup hermes` from the project root so the generated config includes `--project`.
- If skills do not appear, check that `.agents/skills` exists and is listed under `skills.external_dirs`.
- If `knowns` is not on `PATH`, reinstall Knowns globally or use the `npx` config form.
