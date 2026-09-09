# Cấu hình

Know-Me lưu project config trong `.know-me/config.json`.

File này khai báo những gì Know-Me cần quản lý locally: platform integrations, semantic search, generated artifacts.

## Ví dụ

```json
{
  "name": "my-project",
  "settings": {
    "gitTrackingMode": "git-tracked",
    "gitTracking": {
      "tasks": true,
      "docs": true,
      "templates": true,
      "memories": false
    },
    "semanticSearch": {
      "enabled": true,
      "model": "multilingual-e5-small",
      "provider": "local",
      "dimensions": 384
    },
    "platforms": [
      "claude-code",
      "opencode",
      "codex",
      "kiro",
      "antigravity",
      "cursor",
      "gemini",
      "copilot",
      "agents"
    ],
    "lsp": {
      "enabled": true
    }
  }
}
```

## Các setting quan trọng

### `name`

Tên project hiển thị trong Know-Me.

### `settings.gitTrackingMode`

- `git-tracked` — `.know-me/` content tracked trong Git
- `git-ignored` — config/docs/templates tracked, local data thì không
- `none` — Know-Me không quản lý `.gitignore`

### `settings.gitTracking`

Per-section git tracking toggles. Kiểm soát subdirectories nào trong `.know-me/` được include/exclude trong `.gitignore`.

| Field | Default | Mô tả |
|-------|---------|-------|
| `tasks` | `true` | Track task markdown files |
| `docs` | `true` | Track documentation files |
| `templates` | `true` | Track code generation templates |
| `memories` | `false` | Track AI memory entries |

### `settings.semanticSearch`

Config cho semantic search: `enabled`, `model`, `provider`, `dimensions`.

`provider` có thể là `local`, `ollama`, hoặc provider ID đã đăng ký bằng `knowme provider add`.

- `knowme init` set các giá trị này
- `knowme settings` hiển thị Local ONNX models kèm trạng thái downloaded/not downloaded
- Nếu chọn Local ONNX model chưa download trong `knowme settings`, Know-Me hỏi xác nhận rồi download trước khi lưu
- `knowme provider add` và `knowme model add --provider <id> <model-name>` cấu hình API-backed embedding models
- `knowme sync` re-apply semantic setup
- `knowme search --reindex` rebuild local index

### `settings.lsp`

Config cho LSP-based code intelligence.

- `enabled`: bật/tắt LSP servers cho code navigation

### `settings.platforms`

Khai báo platform integrations cần quản lý.

Supported: `claude-code`, `opencode`, `codex`, `kiro`, `antigravity`, `cursor`, `gemini`, `copilot`, `agents`.

Ảnh hưởng tới những gì `setup`, `sync`, `update` tạo hoặc refresh: instruction files, skills, MCP config, runtime hooks, platform-specific config.

## Khi nào edit config trực tiếp?

Có thể edit `.know-me/config.json` trực tiếp, nhưng flow thường là:

- `knowme init` cho lần đầu (project structure + git tracking)
- `knowme init` cũng tạo selected lightweight project instruction shims như `CLAUDE.md` và `AGENTS.md`
- `knowme setup <target> --global` cho personal AI platform integrations thông thường như MCP/config files, skills, runtime hooks
- `knowme setup <target>` chỉ khi bạn chủ ý muốn repo-local integration files
- `knowme setup agents` khi chỉ cần repo-local agent shims
- `knowme settings` để mở settings center tương tác cho project hiện tại
- `knowme settings --global` để lưu defaults dùng lại cho các lần `knowme init` sau
- `knowme config get/set/list/reset` cho script hoặc agent
- `knowme sync` để re-apply config

## Settings và config shorthands

```bash
# Interactive project settings UI
knowme settings
# Hiển thị:
#   Project
#   Git Tracking
#   AI Platforms
#   Search
#   Code Intelligence
#   Browser / Chat UI
#   Maintenance
#   Done

# Defaults cho project mới
knowme settings --global

# Hoặc set trực tiếp qua config API
knowme config set embedding true       # Bật semantic search
knowme config set lsp true             # Bật LSP toàn cục
knowme config set lsp.go true          # Bật LSP cho Go
knowme config set enableChatUI true    # Bật chat UI

# Git Tracking (per-section)
knowme config set gitTracking.tasks true
knowme config set gitTracking.memories false
```

Thay đổi `gitTracking.*` sẽ tự động regenerate `.gitignore`.

Interactive `knowme init` cần terminal rộng tối thiểu 90 cột. Nếu terminal quá nhỏ, Know-Me hiển thị hướng dẫn resize hoặc dùng `knowme init --no-wizard`, rồi dừng mà không tự init bằng defaults.
