# Compatibility

This document explains the main compatibility behaviors Know-Me preserves when platform integrations or generated artifact layouts change.

## Why this exists

Know-Me manages generated files such as:

- skills directories
- MCP configuration files
- instruction files
- runtime hooks

As integrations evolve, older projects may still contain previously generated layouts. Know-Me tries to preserve safe compatibility instead of breaking those projects immediately.

## Skills directory compatibility

Current primary mapping:

- `.claude/skills` -> Claude Code
- `.agents/skills` -> OpenCode, Codex, Hermes Agent, Antigravity, Generic Agents
- `.kiro/skills` -> Kiro

### Legacy behavior

The `.agent/skills` legacy path has been removed. All agent-compatible platforms now use `.agents/skills`.

## Platform-specific MCP compatibility

Know-Me now manages project-local MCP config for several platforms, for example:

- Claude Code -> `.mcp.json`
- Kiro -> `.kiro/settings/mcp.json`
- Cursor -> `.cursor/mcp.json`
- Codex -> `.codex/config.toml`
- OpenCode -> `opencode.json`

For Antigravity, the MCP config is global:

- `~/.gemini/antigravity/mcp_config.json`

## Init, sync, and update

### `knowme init`

Creates the project structure, git tracking, semantic search setup, and selected lightweight project instruction shims such as `CLAUDE.md` and `AGENTS.md`.

### `knowme setup`

Generates AI platform artifacts such as skills, MCP configs, platform-specific configs, runtime hooks, and any additional instruction files for the selected target. Use `knowme setup <target> --global` for normal personal assistant setup. Use non-global setup only when you intentionally want repo-local integration files. Use `knowme setup agents` when you only need lightweight repo-local agent shims.

### `knowme sync`

Re-applies `.know-me/config.json` to the current machine.

Use it after:

- cloning a repository
- wanting generated files to match the current config again

### `knowme update`

Updates the CLI, then refreshes generated artifacts that depend on the binary or config policy.

## Recommendation

- For new projects, follow the current primary layout.
- For older projects, let `knowme sync` and `knowme update` preserve compatibility first, then migrate deliberately when needed.
