# Model Management

Know-Me can use local embedding models for semantic search.

## Main commands

```bash
knowme model add <model-name>
knowme model list
knowme model download multilingual-e5-small
knowme model set multilingual-e5-small
knowme model status
knowme model remove <id>
```

## Typical flow

1. list available models
2. add an API-backed model or download a local model
3. set it in project config
4. reindex search if needed

## Related commands

```bash
knowme search --status-check
knowme search --reindex
```

## Why this matters

Without a local model, semantic search is unavailable and Know-Me will rely on keyword behavior where applicable.
