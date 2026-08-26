# Model management

Know-Me dùng local embedding models cho semantic search.

## Lệnh chính

```bash
knownme model add <model-name>
knownme model list
knownme model download multilingual-e5-small
knownme model set multilingual-e5-small
knownme model status
knownme model remove <id>
```

## Flow

1. List models có sẵn
2. Add API-backed model hoặc download local model
3. Set vào project config
4. Reindex nếu cần

## Lệnh liên quan

```bash
knownme search --status-check
knownme search --reindex
```

## Lưu ý

Không có local model → semantic search không hoạt động → Know-Me fallback về keyword search.
