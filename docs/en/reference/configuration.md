# Configuration

Know-Me stores project configuration in `.know-me/config.json`.

This file describes what the project wants Know-Me to manage locally, including platform integrations, semantic search settings, and generated artifact behavior.

## Example

```json
{
  "name": "my-project",
  "settings": {
    "gitTrackingMode": "git-tracked",
    "gitTracking": {
      "tasks": true,
      "docs": true,
      "templates": true,
      "memories": false
    },
    "semanticSearch": {
      "enabled": true,
      "model": "multilingual-e5-small",
      "provider": "local",
      "dimensions": 384
    },
    "platforms": [
      "claude-code",
      "opencode",
      "codex",
      "kiro",
      "antigravity",
      "cursor",
      "gemini",
      "copilot",
      "agents"
    ],
    "lsp": {
      "enabled": true
    }
  }
}
```

## Important settings

### `name`

The project name shown in Know-Me surfaces.

### `settings.gitTrackingMode`

Controls how Know-Me manages Git-related generated content.

Supported values:

- `git-tracked`
- `git-ignored`
- `none`

Behavior:

- `git-tracked`: keep `.know-me/` content tracked in Git
- `git-ignored`: keep config/docs/templates tracked while leaving some local data out of Git depending on generated ignore rules
- `none`: do not let Know-Me manage `.gitignore`

### `settings.gitTracking`

Per-section git tracking toggles. Controls which `.know-me/` subdirectories are included or excluded in `.gitignore`.

| Field | Default | Description |
|-------|---------|-------------|
| `tasks` | `true` | Track task markdown files |
| `docs` | `true` | Track documentation files |
| `templates` | `true` | Track code generation templates |
| `memories` | `false` | Track AI memory entries |

### `settings.semanticSearch`

Controls local semantic search.

Relevant fields:

- `enabled`
- `model`
- `provider` (`"local"`, `"ollama"`, or a provider ID registered with `knowme provider add`)
- `dimensions`

Common behavior:

- `knowme init` can set these values
- `knowme settings` shows supported Local ONNX models with downloaded/not downloaded status
- Selecting a missing Local ONNX model in `knowme settings` asks before downloading and saving it
- `knowme provider add` and `knowme model add --provider <id> <model-name>` configure API-backed embedding models
- `knowme sync` can re-apply the semantic setup
- `knowme search --reindex` rebuilds the local index

### `settings.lsp`

Controls LSP-based code intelligence.

- `enabled`: whether LSP servers are started for code navigation

### `settings.platforms`

Declares which platform integrations Know-Me should manage.

Supported values:

- `claude-code`
- `opencode`
- `codex`
- `kiro`
- `antigravity`
- `cursor`
- `gemini`
- `copilot`
- `agents`

This setting affects what `knowme setup`, `knowme sync`, and `knowme update` create or refresh.

Examples of managed artifacts:

- instruction files
- skills
- MCP config
- runtime hooks
- platform-specific config files

### `settings.enableChatUI`

Controls whether the browser UI exposes the chat-oriented experience.

### `settings.autoSyncOnUpdate`

Controls whether generated artifacts should be refreshed after upgrading the CLI.

## Practical rules

### When to edit config manually

You can edit `.know-me/config.json` directly if you know what you are doing, but the normal path is:

- `knowme init` for first-time setup (project structure + git tracking)
- `knowme init` also creates selected lightweight project instruction shims such as `CLAUDE.md` and `AGENTS.md`
- `knowme setup <target> --global` for normal personal AI platform integrations such as MCP/config files, skills, and runtime hooks
- `knowme setup <target>` only when you intentionally want repo-local integration files
- `knowme setup agents` when you only need repo-local agent shims
- `knowme settings` for the interactive project settings center
- `knowme settings --global` for defaults reused by future `knowme init` runs
- `knowme config get/set/list/reset` for scriptable config access
- `knowme sync` to re-apply config to the current machine

### Settings and config shorthands

```bash
# Interactive project settings UI
knowme settings
# Shows:
#   Project
#   Git Tracking
#   AI Platforms
#   Search
#   Code Intelligence
#   Browser / Chat UI
#   Maintenance
#   Done

# Defaults for future projects
knowme settings --global

# Or set directly via the scriptable config API
knowme config set embedding true       # Enable semantic search
knowme config set lsp true             # Enable LSP globally
knowme config set lsp.go true          # Enable LSP for Go
knowme config set enableChatUI true    # Enable chat UI

# Git Tracking (per-section)
knowme config set gitTracking.tasks true
knowme config set gitTracking.memories false
```

Changing `gitTracking.*` toggles automatically regenerates `.gitignore`.

Interactive `knowme init` needs a terminal at least 90 columns wide. If the terminal is too small, Know-Me prints resize and `--no-wizard` guidance and stops without initializing by defaults.

### When to use `knowme sync`

Use `knowme sync` after:

- cloning a repo with existing `.know-me/`
- updating the CLI
- wanting to restore generated artifacts to match config

### Platform-related compatibility

Current skills mapping:

- `.claude/skills` -> Claude Code
- `.agents/skills` -> OpenCode, Codex, Hermes Agent, Antigravity, Generic Agents
- `.kiro/skills` -> Kiro

## Related commands

```bash
knowme init
knowme setup
knowme settings
knowme sync
knowme config set <key> <value>
knowme config get <key>
knowme model list
knowme model download multilingual-e5-small
knowme search --status-check
knowme search --reindex
```
