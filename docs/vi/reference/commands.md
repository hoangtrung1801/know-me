# Lệnh

Dùng `knowns <command> --help` để xem syntax chính xác. Trang này là tổng quan thực dụng.

## Conventions

- `--plain` khi AI hoặc script cần text output dễ parse
- `--json` khi cần structured output
- `knowme sync` khi muốn generated files khớp lại với config

## Init và sync

```bash
knowme init
knowme init my-project --no-wizard
knowme init --force
knowme setup --global
knowme setup claude --global
knowme setup codex --global
knowme setup hermes --global
knowme setup all --global
knowme setup agents
knowme setup
knowme setup claude
knowme setup codex
knowme setup hermes
knowme sync
knowme sync --skills
knowme sync --instructions
knowme sync --model
knowme update
knowme update --check
knowme settings
knowme settings --global
```

`knowme init` tạo `.know-me/`, config, git tracking, semantic setup, và lightweight project instruction shims như `CLAUDE.md`/`AGENTS.md`. Runtime-critical AI guidance nằm trong MCP `initial` và on-demand `help`. Dùng `knowme setup <target> --global` cho personal assistant setup thông thường vì nó update user-level MCP config, skills, và runtime hooks trên nhiều repository. Ví dụ: `knowme setup hermes --global` cấu hình Hermes MCP config và skills ở user scope. Chỉ dùng `knowme setup <target>` khi bạn chủ ý muốn project-level integration artifacts trong repo. Dùng `knowme setup agents` khi chỉ muốn repo-local agent shims.

`knowme settings` mở settings center để chỉnh project name, git tracking, AI platforms, search, code intelligence, Browser/Chat UI, và maintenance guidance. Trong Search settings, Local ONNX models hiển thị trạng thái downloaded/not downloaded; nếu chọn model chưa download, Know-Me có thể hỏi xác nhận rồi download trước khi lưu. `knowme settings --global` lưu defaults cho các lần `knowme init` sau. Dùng `knowme config get/set/list/reset` khi cần thao tác config bằng script hoặc agent.

## Task

```bash
knowme task create "Title" -d "Description"
knowme task create "Add auth" \
  --ac "User can login" \
  --ac "JWT token returned" \
  --priority high \
  -l auth

knowme task list --plain
knowme task list --status in-progress --assignee @me
knowme task <id> --plain

knowme task edit <id> -s in-progress
knowme task edit <id> --check-ac 1
knowme task edit <id> --append-notes "Completed middleware"
knowme task edit <id> --plan '1. Research\n2. Implement\n3. Test'
```

## Doc

```bash
knowme doc create "Architecture" -d "System overview" -f architecture
knowme doc create "Auth Pattern" -d "JWT auth pattern" -f patterns -t auth -t security

knowme doc list --plain
knowme doc "architecture/auth" --plain
knowme doc "architecture/auth" --info --plain
knowme doc "architecture/auth" --toc --plain
knowme doc "architecture/auth" --section "2" --plain

knowme doc edit "architecture/auth" -a "\n\n## Notes\n..."
knowme doc edit "architecture/auth" -c "# New content"
knowme doc edit "architecture/auth" --section "2" -c "## 2. Updated section"
```

## Search, retrieve, resolve

```bash
knowme search "authentication" --plain
knowme search "jwt" --type doc --plain
knowme search "jwt" --keyword --plain
knowme search --status-check
knowme search --reindex

knowme retrieve "how auth works" --json
knowme retrieve "auth flow" --source-types doc,task --json

knowme resolve "@doc/specs/auth{implements}" --plain
knowme resolve "@doc/specs/auth{depends}" --direction inbound --depth 2 --plain
```

## Memory

```bash
knowme memory add "We use repository pattern" --category pattern
knowme memory list --plain
knowme memory <id> --plain
knowme memory edit <id> --append "More detail"
```

## Decision

```bash
knowme decision create "Use Postgres for metadata"
knowme decision list --plain
knowme decision get <id> --plain
knowme decision link <id> --source @doc/architecture/storage --task <done-task-id>
knowme decision accept <id>
knowme decision resolve create_draft "Use Postgres for metadata"
knowme decision supersede <old-id> <new-id>

knowme decision migrate preview --plain
knowme decision migrate apply --memory <memory-id> --resolution create_decision
knowme decision migrate rollback <memory-id>
```

Spec Decision là các rule `D1`, `D2`, … được khóa trong spec đã approve. Các lệnh trên quản lý System Decision: lựa chọn project bền vững luôn bắt đầu ở draft, cần source đọc được cùng evidence từ task hoàn tất trước khi accept, và có thể supersede về sau thay vì sửa đè lịch sử.

Migration Decision Memory legacy luôn preview trước, explicit theo từng record, có journal và có thể rollback. Các resolution gồm `create_decision`, `link_existing`, `consolidate_duplicate`, `reclassify`, `archive_noise`, `reject_noise`, `leave_unchanged`; không có bulk apply ngầm.

## Templates

```bash
knowme template list
knowme template get <name>
knowme template run <name>
knowme template create <name>
```

## Code intelligence

### Quản lý LSP

```bash
knowme lsp list                    # Hiển thị ngôn ngữ được hỗ trợ và trạng thái
knowme lsp install <language>      # Tải và cài đặt LSP server
knowme lsp cleanup                 # Xóa các phiên bản LSP server cũ
```

Know-Me tự động phát hiện ngôn ngữ trong project và kiểm tra LSP binaries. Nếu thiếu binary, `knowme lsp list` sẽ hiển thị hướng dẫn cài đặt.

### Code operations (qua MCP)

Code intelligence dựa trên LSP và được truy cập qua MCP `code` tool:

- `symbols` — liệt kê symbols trong file
- `find` — tìm symbols theo name pattern, có thể kèm body/depth
- `definition` — đi tới definition
- `references` — tìm tất cả references
- `implementations` — tìm implementations của interface
- `diagnostics` — lấy compile errors/warnings
- `rename` — đổi tên symbol trong toàn workspace
- `replace` — thay text bằng regex/literal
- `replace_body` — thay toàn bộ body của symbol
- `insert` — chèn code trước/sau một symbol
- `delete` — xóa an toàn với kiểm tra references

### Inspect code index bằng CLI

```bash
knowme code symbols --plain
knowme code search "AuthService" --plain
knowme code deps --plain
```

Dùng CLI `code` commands để inspect indexed symbols/dependencies. Dùng MCP `code` tool cho navigation và edits có cấu trúc.

## Validation

```bash
knowme validate --plain
knowme validate --scope docs --plain
knowme validate --scope sdd --plain
knowme validate --strict --plain
```

## Time tracking

```bash
knowme time start <task-id>
knowme time stop
knowme time add <task-id> 1h30m -n "Pair programming"
knowme time report
```

## Browser UI

```bash
knowme browser
knowme browser --open
knowme browser --port 6421
```

## Project status và audit

```bash
knowme status
knowme audit recent
knowme audit stats
```

Dùng `status` để xem project readiness, và `audit` để inspect MCP tool calls gần đây.

## Guidance files

```bash
knowme setup
knowme sync --skills
knowme sync --instructions
```

## Model

```bash
knowme model add <model-name>
knowme model list
knowme model download multilingual-e5-small
knowme model set multilingual-e5-small
knowme model status
knowme model remove <id>
```

## Provider và runtime adapters

```bash
knowme provider list
knowme provider add --id openai --name "OpenAI" --api-base https://api.openai.com/v1 --api-key <key>
knowme provider test <id>
knowme provider remove <id>

knowme runtime status
knowme runtime install codex
knowme runtime ps
knowme runtime logs
knowme runtime stop
knowme runtime uninstall codex

knowme runtime-memory hook
knowme runtime-memory hook --json
```

Dùng provider commands cho API-backed embedding providers. Dùng runtime commands để install và inspect runtime memory adapters/shared runtime.

Default hook output là plain prompt context cho runtime adapters. Mỗi injected memory có inline score/trust metadata, ví dụ `score=0.92; trust=active`, để assistant tự cân nhắc supplemental context.

Dùng `knowme runtime-memory hook --json` khi caller cần structured metadata thay vì prompt text. JSON output có retrieval item scores và capture trust metadata như `capture.score`, `capture.threshold`, `capture.trusted`, và review `capture.matches` khi cần review.

## Tunnel

```bash
knowme tunnel status
knowme tunnel stop
```

Dùng tunnel commands để inspect hoặc stop Cloudflare Quick Tunnels cho local server sharing.

## Import

```bash
knowme import add <name> <source>
knowme import sync
knowme import list
```
