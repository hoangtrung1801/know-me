# Platforms

Know-Me generate và sync artifacts khác nhau cho từng AI platform qua `knownme setup <target> --global` cho user-level setup, hoặc `knownme setup <target>` cho repo-local setup.

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

## Mapping

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

`knownme init` tạo lightweight project shims để agent route tới MCP `initial`/`help` ngay. Với personal assistant setup thông thường, tạo AI integration artifacts ở user scope:

```bash
knownme setup claude --global      # Claude user-level MCP/skills/hooks
knownme setup opencode --global    # OpenCode user-level MCP/skills/hooks
knownme setup codex --global       # Codex user-level MCP/skills/hooks
knownme setup kiro --global        # Kiro user-level MCP/skills/hooks
knownme setup hermes --global      # Hermes user-level MCP/skills config
knownme setup antigravity --global # Antigravity/Gemini global MCP config
knownme setup cursor --global      # Cursor user-level MCP config
knownme setup gemini --global      # Gemini global MCP config
knownme setup all --global         # Tất cả platforms ở user scope
knownme setup agents               # chỉ lightweight repo-local agent shims
```

## Ghi chú

- `.agents/skills` là primary path cho agent-compatible platforms
- Chi tiết setup Hermes nằm ở [Hermes Agent](./hermes.md)
- `knownme init` tạo selected lightweight instruction shims mặc định, như `CLAUDE.md` và `AGENTS.md`
- dùng `knownme setup <target> --global` cho personal assistant setup thông thường trên nhiều repository
- chỉ dùng `knownme setup <target>` khi bạn chủ ý muốn project-level MCP/config files, skills, runtime hooks
