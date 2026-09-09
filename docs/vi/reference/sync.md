# Sync

`knowme sync` re-apply `.know-me/config.json` lên máy hiện tại.

## Khi nào dùng

Chạy `knowme sync` sau khi:

- clone repo có sẵn `.know-me/`
- upgrade CLI
- muốn generated files khớp lại với config

Để tạo lightweight project shims ban đầu, dùng `knowme init` hoặc `knowme setup agents`. Với personal AI platform setup thông thường (skills, MCP configs, runtime hooks), dùng `knowme setup <target> --global`. Chỉ dùng setup không có `--global` khi bạn chủ ý muốn repo-local integration files.

## Các dạng dùng

```bash
knowme sync
knowme sync --skills
knowme sync --instructions
knowme sync --model
knowme sync --instructions --platform claude
knowme sync --instructions --platform cursor
```

## Refresh được gì

- skills
- instruction files
- MCP config
- platform-specific config
- git integration
- semantic-search setup
- search indexes

## Xem thêm

- [Cấu hình](./configuration.md)
- [Tương thích](../integrations/compatibility.md)
- [Auto sync](../integrations/auto-sync.md)
