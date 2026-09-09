# Dự án đầu tiên

Sau `knowme init`, mục tiêu đầu tiên là thêm đủ context để một người hoặc AI assistant hiểu project mà không cần một chat history dài. Một setup đầu tiên thường gồm 4 việc:

1. tạo task
2. tạo 1-2 doc
3. kiểm tra search hoạt động
4. kết nối AI runtime đang dùng

## Ví dụ

Ví dụ này tạo auth task vì scope rõ và acceptance criteria dễ kiểm tra. Hãy thay title và description bằng work thật trong repository của bạn.

```bash
knowme task create "Add authentication" \
  -d "JWT-based auth with login and register endpoints" \
  --ac "User can register with email/password" \
  --ac "User can login and receive JWT token"

knowme doc create "Auth Architecture" \
  -d "Authentication design decisions" \
  -f architecture

knowme search "authentication" --plain
knowme validate --plain
knowme browser --open
```

Nếu muốn AI assistant dùng cùng project context, chạy setup cho platform của bạn:

```bash
knowme setup codex --global
# hoặc:
knowme setup claude --global
```

Dùng `--global` cho personal assistant setup vì nó update user-level MCP config, skills, và runtime hooks. Chỉ dùng setup không có `--global` khi bạn chủ ý muốn repo-local integration files.

## Tại sao?

- Task cho người và AI mục tiêu cụ thể
- Acceptance criteria biến "done" thành thứ kiểm tra được
- Doc cho AI context có cấu trúc thay vì giải thích rời rạc trong chat
- Search xác nhận retrieval đang chạy
- Validate kiểm tra cấu trúc project cơ bản
- Setup kết nối generated guidance, MCP config, và skill với assistant bạn thật sự dùng

## Nên thêm gì tiếp?

- Thêm một architecture doc cho subsystem quan trọng nhất.
- Thêm một task cho thay đổi thật tiếp theo bạn định làm.
- Chỉ thêm Memory cho pattern hoặc convention ngắn cần recall; dùng System Decision cho lựa chọn project bền vững.
- Chạy `knowme validate --plain` trước khi xem project setup là xong.

## Tiếp theo

- [Hướng dẫn sử dụng](../guides/user-guide.md)
- [MCP](../guides/mcp-integration.md)
