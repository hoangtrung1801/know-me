# Semantic Search

Semantic search helps Know-Me search docs, tasks, and memories by meaning instead of only exact keywords.

Code search is no longer part of semantic search. Code intelligence is LSP-based and available through the MCP `code` tool.

## Main commands

```bash
knownme model list
knownme model download multilingual-e5-small
knownme model set multilingual-e5-small
knownme search --status-check
knownme search --reindex
knownme search "how authentication works" --plain
```

## Search modes

- `keyword`
- `semantic`
- `hybrid`

## Operational note

If semantic components are unavailable, the relevant search paths can safely fall back instead of crashing.
