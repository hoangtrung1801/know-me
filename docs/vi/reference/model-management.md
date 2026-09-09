# Model management

Know-Me dùng local embedding models cho semantic search.

## Lệnh chính

```bash
knowme model add <model-name>
knowme model list
knowme model download multilingual-e5-small
knowme model set multilingual-e5-small
knowme model status
knowme model remove <id>
```

## Flow

1. List models có sẵn
2. Add API-backed model hoặc download local model
3. Set vào project config
4. Reindex nếu cần

## Lệnh liên quan

```bash
knowme search --status-check
knowme search --reindex
```

## Lưu ý

Không có local model → semantic search không hoạt động → Know-Me fallback về keyword search.
