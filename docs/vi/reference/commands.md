# Lệnh

Dùng `knowns <command> --help` để xem syntax chính xác. Trang này là tổng quan thực dụng.

## Conventions

- `--plain` khi AI hoặc script cần text output dễ parse
- `--json` khi cần structured output
- `knownme sync` khi muốn generated files khớp lại với config

## Init và sync

```bash
knownme init
knownme init my-project --no-wizard
knownme init --force
knownme setup --global
knownme setup claude --global
knownme setup codex --global
knownme setup hermes --global
knownme setup all --global
knownme setup agents
knownme setup
knownme setup claude
knownme setup codex
knownme setup hermes
knownme sync
knownme sync --skills
knownme sync --instructions
knownme sync --model
knownme update
knownme update --check
knownme settings
knownme settings --global
```

`knownme init` tạo `.know-me/`, config, git tracking, semantic setup, và lightweight project instruction shims như `CLAUDE.md`/`AGENTS.md`. Runtime-critical AI guidance nằm trong MCP `initial` và on-demand `help`. Dùng `knownme setup <target> --global` cho personal assistant setup thông thường vì nó update user-level MCP config, skills, và runtime hooks trên nhiều repository. Ví dụ: `knownme setup hermes --global` cấu hình Hermes MCP config và skills ở user scope. Chỉ dùng `knownme setup <target>` khi bạn chủ ý muốn project-level integration artifacts trong repo. Dùng `knownme setup agents` khi chỉ muốn repo-local agent shims.

`knownme settings` mở settings center để chỉnh project name, git tracking, AI platforms, search, code intelligence, Browser/Chat UI, và maintenance guidance. Trong Search settings, Local ONNX models hiển thị trạng thái downloaded/not downloaded; nếu chọn model chưa download, Know-Me có thể hỏi xác nhận rồi download trước khi lưu. `knownme settings --global` lưu defaults cho các lần `knownme init` sau. Dùng `knownme config get/set/list/reset` khi cần thao tác config bằng script hoặc agent.

## Task

```bash
knownme task create "Title" -d "Description"
knownme task create "Add auth" \
  --ac "User can login" \
  --ac "JWT token returned" \
  --priority high \
  -l auth

knownme task list --plain
knownme task list --status in-progress --assignee @me
knownme task <id> --plain

knownme task edit <id> -s in-progress
knownme task edit <id> --check-ac 1
knownme task edit <id> --append-notes "Completed middleware"
knownme task edit <id> --plan '1. Research\n2. Implement\n3. Test'
```

## Doc

```bash
knownme doc create "Architecture" -d "System overview" -f architecture
knownme doc create "Auth Pattern" -d "JWT auth pattern" -f patterns -t auth -t security

knownme doc list --plain
knownme doc "architecture/auth" --plain
knownme doc "architecture/auth" --info --plain
knownme doc "architecture/auth" --toc --plain
knownme doc "architecture/auth" --section "2" --plain

knownme doc edit "architecture/auth" -a "\n\n## Notes\n..."
knownme doc edit "architecture/auth" -c "# New content"
knownme doc edit "architecture/auth" --section "2" -c "## 2. Updated section"
```

## Search, retrieve, resolve

```bash
knownme search "authentication" --plain
knownme search "jwt" --type doc --plain
knownme search "jwt" --keyword --plain
knownme search --status-check
knownme search --reindex

knownme retrieve "how auth works" --json
knownme retrieve "auth flow" --source-types doc,task --json

knownme resolve "@doc/specs/auth{implements}" --plain
knownme resolve "@doc/specs/auth{depends}" --direction inbound --depth 2 --plain
```

## Memory

```bash
knownme memory add "We use repository pattern" --category pattern
knownme memory list --plain
knownme memory <id> --plain
knownme memory edit <id> --append "More detail"
```

## Decision

```bash
knownme decision create "Use Postgres for metadata"
knownme decision list --plain
knownme decision get <id> --plain
knownme decision link <id> --source @doc/architecture/storage --task <done-task-id>
knownme decision accept <id>
knownme decision resolve create_draft "Use Postgres for metadata"
knownme decision supersede <old-id> <new-id>

knownme decision migrate preview --plain
knownme decision migrate apply --memory <memory-id> --resolution create_decision
knownme decision migrate rollback <memory-id>
```

Spec Decision là các rule `D1`, `D2`, … được khóa trong spec đã approve. Các lệnh trên quản lý System Decision: lựa chọn project bền vững luôn bắt đầu ở draft, cần source đọc được cùng evidence từ task hoàn tất trước khi accept, và có thể supersede về sau thay vì sửa đè lịch sử.

Migration Decision Memory legacy luôn preview trước, explicit theo từng record, có journal và có thể rollback. Các resolution gồm `create_decision`, `link_existing`, `consolidate_duplicate`, `reclassify`, `archive_noise`, `reject_noise`, `leave_unchanged`; không có bulk apply ngầm.

## Templates

```bash
knownme template list
knownme template get <name>
knownme template run <name>
knownme template create <name>
```

## Code intelligence

### Quản lý LSP

```bash
knownme lsp list                    # Hiển thị ngôn ngữ được hỗ trợ và trạng thái
knownme lsp install <language>      # Tải và cài đặt LSP server
knownme lsp cleanup                 # Xóa các phiên bản LSP server cũ
```

Know-Me tự động phát hiện ngôn ngữ trong project và kiểm tra LSP binaries. Nếu thiếu binary, `knownme lsp list` sẽ hiển thị hướng dẫn cài đặt.

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
knownme code symbols --plain
knownme code search "AuthService" --plain
knownme code deps --plain
```

Dùng CLI `code` commands để inspect indexed symbols/dependencies. Dùng MCP `code` tool cho navigation và edits có cấu trúc.

## Validation

```bash
knownme validate --plain
knownme validate --scope docs --plain
knownme validate --scope sdd --plain
knownme validate --strict --plain
```

## Time tracking

```bash
knownme time start <task-id>
knownme time stop
knownme time add <task-id> 1h30m -n "Pair programming"
knownme time report
```

## Browser UI

```bash
knownme browser
knownme browser --open
knownme browser --port 6421
```

## Project status và audit

```bash
knownme status
knownme audit recent
knownme audit stats
```

Dùng `status` để xem project readiness, và `audit` để inspect MCP tool calls gần đây.

## Guidance files

```bash
knownme setup
knownme sync --skills
knownme sync --instructions
```

## Model

```bash
knownme model add <model-name>
knownme model list
knownme model download multilingual-e5-small
knownme model set multilingual-e5-small
knownme model status
knownme model remove <id>
```

## Provider và runtime adapters

```bash
knownme provider list
knownme provider add --id openai --name "OpenAI" --api-base https://api.openai.com/v1 --api-key <key>
knownme provider test <id>
knownme provider remove <id>

knownme runtime status
knownme runtime install codex
knownme runtime ps
knownme runtime logs
knownme runtime stop
knownme runtime uninstall codex

knownme runtime-memory hook
knownme runtime-memory hook --json
```

Dùng provider commands cho API-backed embedding providers. Dùng runtime commands để install và inspect runtime memory adapters/shared runtime.

Default hook output là plain prompt context cho runtime adapters. Mỗi injected memory có inline score/trust metadata, ví dụ `score=0.92; trust=active`, để assistant tự cân nhắc supplemental context.

Dùng `knownme runtime-memory hook --json` khi caller cần structured metadata thay vì prompt text. JSON output có retrieval item scores và capture trust metadata như `capture.score`, `capture.threshold`, `capture.trusted`, và review `capture.matches` khi cần review.

## Tunnel

```bash
knownme tunnel status
knownme tunnel stop
```

Dùng tunnel commands để inspect hoặc stop Cloudflare Quick Tunnels cho local server sharing.

## Import

```bash
knownme import add <name> <source>
knownme import sync
knownme import list
```
