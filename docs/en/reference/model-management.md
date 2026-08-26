# Model Management

Know-Me can use local embedding models for semantic search.

## Main commands

```bash
knownme model add <model-name>
knownme model list
knownme model download multilingual-e5-small
knownme model set multilingual-e5-small
knownme model status
knownme model remove <id>
```

## Typical flow

1. list available models
2. add an API-backed model or download a local model
3. set it in project config
4. reindex search if needed

## Related commands

```bash
knownme search --status-check
knownme search --reindex
```

## Why this matters

Without a local model, semantic search is unavailable and Know-Me will rely on keyword behavior where applicable.
