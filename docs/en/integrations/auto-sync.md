# Auto Sync

Know-Me uses `knownme sync` and `knownme update` to keep generated artifacts aligned with the current binary and project config.

## What gets synced

- instruction files
- skills
- MCP config
- platform-specific config
- git integration
- semantic setup and indexing

## Related commands

```bash
knownme sync
knownme sync --skills
knownme sync --instructions
knownme update
```

## Legacy note

The `.agent/skills` legacy path has been removed. All agent-compatible platforms now use `.agents/skills`.
