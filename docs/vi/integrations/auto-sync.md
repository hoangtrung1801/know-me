# Auto sync

Know-Me dùng `knowme sync` và `knowme update` để giữ generated artifacts đồng bộ với binary và project config.

## Sync được gì

- instruction files
- skills
- MCP config
- platform-specific config
- git integration
- semantic setup và indexing

## Lệnh

```bash
knowme sync
knowme sync --skills
knowme sync --instructions
knowme update
```

## Legacy

Path `.agent/skills` đã bị xóa. Tất cả agent-compatible platforms giờ dùng `.agents/skills`.
