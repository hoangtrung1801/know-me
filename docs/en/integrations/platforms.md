# Platforms

Know-Me can generate and sync different artifacts for different AI platforms via `knownme setup <target> --global` for user-level setup, or `knownme setup <target>` for repo-local setup.

## Platform IDs

- `claude-code`
- `opencode`
- `codex`
- `kiro`
- `hermes`
- `antigravity`
- `cursor`
- `gemini`
- `copilot`
- `agents`

## Current mapping

| Platform | Skills | MCP/config | Runtime hooks |
|---|---|---|---|
| Claude Code | `.claude/skills` | `.mcp.json` | yes |
| OpenCode | `.agents/skills` | `opencode.json` | plugin/runtime |
| Codex | `.agents/skills` | `.codex/config.toml` | hooks |
| Kiro | `.kiro/skills` | `.kiro/settings/mcp.json` | hooks |
| Hermes Agent | `.agents/skills` | `~/.hermes/config.yaml` (user-level) | no |
| Antigravity | `.agents/skills` | `~/.gemini/antigravity/mcp_config.json` | rules + global config |
| Cursor | none by default | `.cursor/mcp.json` | no |
| Gemini CLI | none by default | platform-managed/global | no |
| GitHub Copilot | instruction only | no | no |
| Generic agents | `.agents/skills` | no | no |

## Setup

`knownme init` creates lightweight project shims so agents can route to MCP `initial`/`help` immediately. For normal personal assistant setup, generate AI integration artifacts at user scope:

```bash
knownme setup claude --global      # Claude user-level MCP/skills/hooks
knownme setup opencode --global    # OpenCode user-level MCP/skills/hooks
knownme setup codex --global       # Codex user-level MCP/skills/hooks
knownme setup kiro --global        # Kiro user-level MCP/skills/hooks
knownme setup hermes --global      # Hermes user-level MCP/skills config
knownme setup antigravity --global # Antigravity/Gemini global MCP config
knownme setup cursor --global      # Cursor user-level MCP config
knownme setup gemini --global      # Gemini global MCP config
knownme setup all --global         # All supported platforms at user scope
knownme setup agents               # Lightweight repo-local agent shims only
```

## Notes

- `.agents/skills` is the primary path for agent-compatible platforms
- Hermes-specific setup details are in [Hermes Agent](./hermes.md)
- `knownme init` creates selected lightweight instruction shims by default, such as `CLAUDE.md` and `AGENTS.md`
- use `knownme setup <target> --global` for normal personal assistant setup across repositories
- use `knownme setup <target>` only when you intentionally want project-level MCP/config files, skills, and runtime hooks
