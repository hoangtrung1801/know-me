# Web UI

Know-Me includes a browser UI for people who prefer to inspect project context visually instead of only through CLI output. It reads the same project state as the CLI and MCP server, so tasks, docs, memory, graph views, config, and chat workflows stay connected.

## Open it

```bash
knowme browser
knowme browser --open
```

Run the command from a Know-Me project. Use `--open` when you want Know-Me to start the local server and open your default browser automatically.

## Main areas
- **Dashboard & workspace metrics**: scan throughput, work aging, lead time, delivery signals, and pinned focus items.

<p align="center">
  <img src="../../../images/screenshot-dashboard.png" alt="Know-Me Dashboard" width="100%">
</p>

- **Board and task views**: scan active work, delivery stages (`To Do`, `In Progress`, `In Review`, `Done`), priorities, acceptance criteria, and notes.

<p align="center">
  <img src="../../../images/screenshot-kanban.png" alt="Know-Me Kanban Board" width="100%">
</p>

- **Docs browser**: read and edit project docs without remembering CLI paths.

<p align="center">
  <img src="../../../images/screenshot-docs.png" alt="Know-Me Documentation" width="100%">
</p>

- **Graph / knowledge views**: explore relationships between tasks, docs, memory, and references.

<p align="center">
  <img src="../../../images/screenshot-graph.png" alt="Know-Me Knowledge Graph" width="100%">
</p>

- **Configuration pages**: inspect project settings, search setup, code intelligence, and integration state.
- **Chat page**: use chat-driven workflows when the browser UI is a better fit than a terminal.

## When to use it

- when you want a board-oriented task view
- when browsing docs is easier in a UI than in CLI output
- when you want graph exploration or chat-driven workflows
- when onboarding someone who should understand the project before using CLI commands

## How it fits with AI setup

The Web UI is not a replacement for MCP `initial` and `help`. It is the human-facing view of the same context. AI assistants should still start from MCP `initial`, use `help` for workflow/tool details, and use the Web UI only when a person wants to inspect or edit context visually.
