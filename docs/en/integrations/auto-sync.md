# Auto Sync

Know-Me uses `knowme sync` and `knowme update` to keep generated artifacts aligned with the current binary and project config.

## What gets synced

- instruction files
- skills
- MCP config
- platform-specific config
- git integration
- semantic setup and indexing

## Related commands

```bash
knowme sync
knowme sync --skills
knowme sync --instructions
knowme update
```

## Legacy note

The `.agent/skills` legacy path has been removed. All agent-compatible platforms now use `.agents/skills`.
