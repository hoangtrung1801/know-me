# OPENCODE

Compatibility entrypoint for runtimes that auto-detect `OPENCODE.md`.

<!-- KNOWNS GUIDELINES START -->

**CRITICAL: You MUST read and follow `KNOWNS.md` in the repository root before doing any work. It is the canonical source of truth for all agent behavior in this project.**

## Canonical Guidance

- Know-Me is the repository memory layer for humans and the AI-friendly working layer for agents.
- The source of truth for repo-level agent guidance is `KNOWNS.md`.
- Read `KNOWNS.md` first whenever the runtime supports reading repository files.
- Load behavior, memory policy, and workflow rules from `KNOWNS.md`; treat this file only as a compatibility entrypoint.
- If this file and `KNOWNS.md` differ, follow `KNOWNS.md`.

## Minimum Rules

- Use Know-Me as the canonical system for tasks, docs, templates, and workflow state.
- Never manually edit Know-Me-managed task or doc markdown.
- Search first, then read only relevant docs and code.
- Use `search` for discovery; use MCP `retrieve` tool when a workflow needs structured context with citations. Fall back to CLI `knownme retrieve` if MCP is unavailable.
- For code operations, use `code` tool: `symbols` for structure, `find` for search, `references`/`definition` for navigation, `rename`/`replace`/`insert`/`delete` for editing. Use `help("code.*")` for details.
- Plan before implementation unless the user explicitly overrides that workflow.
- Validate before considering work complete.
- Use memory tools: `memory({ action: "list" })` at session start, `memory({ action: "add" })` after tasks for reusable knowledge.
- Proactively capture durable memory based on `KNOWNS.md` memory rules; do not wait for an explicit user instruction to save memory when scope and durability are clear.

## Quick Reference

```bash
knownme doc list --plain               # List docs
knownme task list --plain              # List tasks
knownme task <id> --plain              # View task
knownme doc "<path>" --plain --smart  # View doc
knownme search "query" --plain        # Search docs/tasks
knownme retrieve "query" --json      # Retrieve structured context pack (CLI fallback)
```

<!-- KNOWNS GUIDELINES END -->
