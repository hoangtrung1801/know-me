# Lệnh

Dùng `knowns <command> --help` để xem syntax chính xác. Trang này là tổng quan thực dụng.

## Conventions

- `--plain` khi AI hoặc script cần text output dễ parse
- `--json` khi cần structured output
- `knowme setup` khi muốn generated files khớp lại với config

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

knowme runtime status
knowme runtime install codex
knowme runtime ps
knowme runtime logs
knowme runtime stop
knowme runtime uninstall codex

knowme runtime-memory hook
knowme runtime-memory hook --json
```

Dùng runtime commands để install và inspect runtime adapters/shared runtime.

Default hook output là plain prompt context cho runtime adapters. Mỗi injected memory có inline score/trust metadata, ví dụ `score=0.92; trust=active`, để assistant tự cân nhắc supplemental context.

Dùng `knowme runtime-memory hook --json` khi caller cần structured metadata thay vì prompt text. JSON output có retrieval item scores và capture trust metadata như `capture.score`, `capture.threshold`, `capture.trusted`, và review `capture.matches` khi cần review.

