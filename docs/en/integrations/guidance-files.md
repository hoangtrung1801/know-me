# Guidance Files

Know-Me uses lightweight compatibility files for AI runtimes that auto-detect repository instruction files. These files should be small entrypoints that tell the assistant to start with Know-Me MCP `initial` and use on-demand `help` for tool schemas and workflow guidance.

Runtime-critical guidance lives in MCP `initial` and `help`, not in a large repository prompt file. This lets Know-Me update agent behavior without requiring every repository to change generated markdown.

## Compatibility files

- `CLAUDE.md`
- `OPENCODE.md`
- `GEMINI.md`
- `AGENTS.md`
- `.github/copilot-instructions.md`

## Refresh generated content

```bash
knowme init
knowme setup agents
knowme setup --global
knowme sync
knowme sync --instructions
```

Use `knowme init` to create the initial project state and selected lightweight shims. Use `knowme setup agents` to create or refresh generic repo-local shims, `knowme setup <target> --global` for normal personal platform integrations, or `knowme sync` to refresh generated files from config.

## Agent bootstrap

At session start, the assistant should:

1. call MCP `initial`
2. use `help("tool.*")` or `help("workflow.*")` when it needs details
3. use CLI commands only as a fallback when MCP is unavailable
