# AGENTS

Compatibility entrypoint for runtimes that auto-detect `AGENTS.md`.

<!-- KNOWNS GUIDELINES START -->

**CRITICAL: Start with Know-Me MCP `initial` when available. Use `help("tool.*")` or `help("workflow.*")` for domain details on demand.**

## Runtime Guidance

- Know-Me is the repository memory layer for humans and the AI-friendly working layer for agents.
- MCP `initial` is the primary AI bootstrap: project state, tool domains, code rules, and workflow routing.
- MCP `help` is the primary on-demand source for action schemas and recipes.
- `KNOWNS.md` is a human-readable reference and fallback, not a required startup read.
- Treat this file only as a lightweight compatibility entrypoint.

## Minimum Rules

- Use Know-Me as the canonical system for tasks, docs, templates, and workflow state.
- Never manually edit Know-Me-managed task or doc markdown.
- Search first, then read only relevant docs and code.
- Use `search` for discovery; use MCP `retrieve` tool when a workflow needs structured context with citations. Fall back to CLI `knowme retrieve` if MCP is unavailable.
- For code operations, use `code` tool: `find`/`symbols` for structure, `references`/`definition` for navigation, `rename`/`replace`/`replace_body`/`insert`/`delete` for editing. Use `help("code.*")` or `help("workflow.code-edit")` for details.
- Plan before implementation unless the user explicitly overrides that workflow.
- Validate before considering work complete.
- Use memory tools: `memory({ action: "list" })` at session start, `memory({ action: "add" })` after tasks for reusable knowledge.
- Proactively capture durable memory when scope and durability are clear.

## Quick Reference

```bash
knowme doc list --plain               # List docs
knowme task list --plain              # List tasks
knowme task <id> --plain              # View task
knowme doc "<path>" --plain --smart  # View doc
knowme search "query" --plain        # Search docs/tasks
knowme retrieve "query" --json      # Retrieve structured context pack (CLI fallback)
```

<!-- KNOWNS GUIDELINES END -->
