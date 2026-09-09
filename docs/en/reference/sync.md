# Sync

`knowme sync` re-applies `.know-me/config.json` to the current machine.

## When to use it

Use `knowme sync` after:

- cloning a repository with existing `.know-me/`
- upgrading the CLI
- wanting generated files to match config again

For initial lightweight project shims, use `knowme init` or `knowme setup agents`. For normal personal AI platform setup (skills, MCP configs, runtime hooks), use `knowme setup <target> --global`. Use non-global setup only when you intentionally want repo-local integration files.

## Common forms

```bash
knowme sync
knowme sync --skills
knowme sync --instructions
knowme sync --model
knowme sync --instructions --platform claude
knowme sync --instructions --platform cursor
```

## What it can refresh

- skills
- instruction files
- MCP config
- platform-specific config
- git integration
- semantic-search setup
- search indexes where relevant flows apply

## Related

- [Configuration](./configuration.md)
- [Compatibility](../integrations/compatibility.md)
- [Auto Sync](../integrations/auto-sync.md)
