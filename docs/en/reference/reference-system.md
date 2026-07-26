# Reference System

Knowns supports structured references between tasks, docs, memory, and templates.

## Common forms

- `@task-abc123`
- `@doc/guides/setup`
- `@memory-xyz789`
- `@template/react-component`

## Useful doc suffixes

- `@doc/path:42`
- `@doc/path:10-20`
- `@doc/path#heading-slug`

## Why references matter

References let humans and AI move through project context without guessing filenames or IDs manually.

## Related commands

```bash
knowns resolve "@doc/specs/auth{implements}" --plain
knowns search "authentication" --plain
knowns retrieve "how auth works" --json
```
