# Quick start

Cách nhanh nhất để có một project Know-Me chạy được. Sau trang này, repository của bạn sẽ có Know-Me project state, một task, một doc, validation chạy được, và Web UI có thể mở lại sau.

Chạy các command này từ repository bạn muốn Know-Me quản lý.

## 1. Init project

```bash
knowme init
# hoặc không cài global:
npx knowme init
```

Init wizard cho phép cấu hình:

- tên project
- git tracking mode (với per-section toggles)
- lightweight project instruction shims như `CLAUDE.md` và `AGENTS.md`
- semantic search
- embedding model

`knowme init` tạo local Know-Me project store và lightweight compatibility shims. Runtime-critical AI guidance nằm trong MCP `initial` và on-demand `help`, nên các file này nên nhỏ gọn. AI platform integrations như MCP configs, skills, runtime hooks được cấu hình riêng bằng `knowme setup <target> --global` cho user-level setup, hoặc `knowme setup <target>` khi bạn chủ ý muốn repo-local integration files.

## 2. Tạo task

```bash
knowme task create "Setup project" -d "Init project với Know-Me"
```

Task là đơn vị work chính. Nó cho cả người và AI assistant một mục tiêu cụ thể.

## 3. Tạo doc

```bash
knowme doc create "Architecture" -d "Tổng quan hệ thống" -f architecture
```

Doc lưu project knowledge bền vững. Doc tốt hơn việc phải lặp lại cùng context trong từng AI chat.

## 4. Kiểm tra project

```bash
knowme search "architecture" --plain
knowme validate --plain
```

Search xác nhận retrieval tìm được project context. Validate kiểm tra cấu trúc Know-Me project trước khi bạn xây workflow nhiều hơn lên trên nó.

## 5. Mở Web UI

```bash
knowme browser --open
```

Web UI hiển thị cùng project state với CLI, gồm task, doc, graph views, config, và chat workflows.

## 6. Tùy chọn: kết nối AI platform

Dùng setup cho platform bạn thật sự dùng:

```bash
knowme setup codex --global
knowme setup claude --global
knowme setup agents
```

Dùng `--global` cho personal assistant setup thông thường để Know-Me update user-level MCP config, skills, và runtime hooks trên nhiều repository. Dùng `knowme setup agents` khi chỉ cần repo-local compatibility shims như `AGENTS.md`.

Sau setup, agent workflows có thể dùng lightweight shim files, MCP config, và skill cho platform đó. Claude dùng skill command dạng `/kn-*`; Codex dùng skill command dạng `$kn-*`.

Xem [Platforms](../integrations/platforms.md) để biết các setup target được hỗ trợ.

## 7. Sync khi cần

```bash
knowme sync
knowme update
```

Chạy `knowme sync` sau khi clone repo, đổi selected platforms, hoặc update CLI. Dùng `knowme update` khi muốn Know-Me refresh generated project artifacts theo behavior hiện tại của CLI.

## 8. Mở lại Web UI

```bash
knowme browser --open
```

## Bây giờ bạn đã có gì?

- một Know-Me project đã init trong repository này
- lightweight compatibility shims cho agent
- một task và một doc để kiểm tra project model hoạt động
- cách search, validate, và browse project context

## Tiếp theo

- [Dự án đầu tiên](./first-project.md)
- [Hướng dẫn sử dụng](../guides/user-guide.md)
- [Workflow](../guides/workflow.md)
