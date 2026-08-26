# Hướng dẫn sử dụng

Dành cho người dùng Know-Me trong project thực tế, không chỉ thử CLI một lần.

Know-Me hữu ích nhất khi bạn xem nó là shared project context nằm cạnh source code. CLI, MCP server, và Web UI cùng đọc/ghi trên một project state, nên work tạo ở một surface sẽ thấy được ở các surface còn lại.

## Mô hình chính

Know-Me là một context layer cho project, gồm 5 phần gắn với nhau:

- **task** cho planned work, status, acceptance criteria, implementation plan, và notes
- **doc** cho project knowledge bền vững như architecture, spec, decision, và onboarding
- **memory** cho context ngắn có thể dùng lại, ví dụ team convention hoặc assistant preference
- **template** cho project scaffolding lặp lại
- **search / retrieval** để tìm context liên quan khi người hoặc AI cần

Thói quen quan trọng là đưa context có thể tái sử dụng vào Know-Me, thay vì chỉ để nó trong chat message.

## `knownme init` làm gì?

- Chạy interactive wizard
- Sau wizard:
  - tạo cấu trúc project
  - apply config
  - cấu hình git integration
  - tạo lightweight project instruction shims như `CLAUDE.md` và `AGENTS.md`
  - build semantic index (nếu bật)

Sau init, chạy `knownme setup <target> --global` để cấu hình user-level AI platform integrations như skills, MCP configs, runtime hooks. Đây là setup được khuyên dùng cho personal assistant usage trên nhiều repository. Chỉ dùng `knownme setup <target>` khi bạn chủ ý muốn repo-local integration files, hoặc `knownme setup agents` nếu chỉ cần lightweight repo-local shims như `AGENTS.md`.

## Workflow tuần đầu thường dùng

1. Tạo một task cho thay đổi thật tiếp theo.
2. Thêm acceptance criteria để success có thể quan sát được.
3. Tạo hoặc update doc cho architecture/product context mà task phụ thuộc.
4. Dùng `knownme search` hoặc `knownme retrieve` để xác nhận context tìm được.
5. Cho AI assistant đọc task, doc, và memory qua MCP hoặc lightweight shim files.
6. Validate trước khi đánh dấu work là xong.

Bạn không cần document mọi thứ trong ngày đầu. Bắt đầu với work đang active, rồi thêm doc và memory khi thấy mình phải giải thích lại cùng một context nhiều lần.

## Terminal

- Wizard dùng alternate screen để giảm lỗi hiển thị khi resize
- Output từ installer bên thứ ba có thể khá ồn

## Thao tác hằng ngày

### Task

```bash
knownme task create "Add authentication" -d "JWT-based auth"
knownme task edit <id> -s in-progress
knownme task edit <id> --check-ac 1
knownme task edit <id> --append-notes "Completed auth middleware"
```

### Doc

```bash
knownme doc create "Auth Architecture" -d "Design overview" -f architecture
knownme doc "architecture/auth-architecture" --plain
knownme doc "architecture/auth-architecture" --toc --plain
```

### Search

```bash
knownme search "authentication" --plain
knownme retrieve "how auth works" --json
```

### Validate

```bash
knownme validate --plain
```

### Sync

```bash
knownme sync
```

## Chọn surface nào?

- Dùng CLI khi cần command nhanh, script, hoặc terminal-first work.
- Dùng Web UI khi cần board, doc browser, graph view, config pages, hoặc chat workflow.
- Dùng MCP khi AI assistant cần structured access tới task, doc, search, memory, template, và validation.
- Dùng skill khi muốn agent-side workflow như tạo spec, implement, review, hoặc orchestration bằng full flow.

## Tiếp theo

- [Workflow](./workflow.md)
- [MCP](./mcp-integration.md)
- [Lệnh](../reference/commands.md)
