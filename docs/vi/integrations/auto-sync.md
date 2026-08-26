# Auto sync

Know-Me dùng `knownme sync` và `knownme update` để giữ generated artifacts đồng bộ với binary và project config.

## Sync được gì

- instruction files
- skills
- MCP config
- platform-specific config
- git integration
- semantic setup và indexing

## Lệnh

```bash
knownme sync
knownme sync --skills
knownme sync --instructions
knownme update
```

## Legacy

Path `.agent/skills` đã bị xóa. Tất cả agent-compatible platforms giờ dùng `.agents/skills`.
