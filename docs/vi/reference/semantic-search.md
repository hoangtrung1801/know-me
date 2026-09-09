# Semantic search

Semantic search giúp Know-Me tìm docs, tasks, và memories theo ý nghĩa, không chỉ khớp keyword chính xác.

Code search không còn thuộc semantic search. Code intelligence hiện dựa trên LSP và có qua MCP `code` tool.

## Lệnh chính

```bash
knowme model list
knowme model download multilingual-e5-small
knowme model set multilingual-e5-small
knowme search --status-check
knowme search --reindex
knowme search "how authentication works" --plain
```

## Search modes

- `keyword`
- `semantic`
- `hybrid`

## Lưu ý

Nếu semantic components chưa sẵn sàng, search tự fallback về safe mode thay vì crash.
