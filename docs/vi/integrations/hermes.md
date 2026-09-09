# Hermes Agent

Dùng Hermes Agent với Know-Me qua MCP, `AGENTS.md`, và Know-Me skills khi cần.

Hermes đọc project context files như `AGENTS.md`, hỗ trợ MCP servers qua `~/.hermes/config.yaml`, và có thể scan external skill directories. Know-Me kết hợp ba bề mặt này:

- `AGENTS.md` yêu cầu Hermes bắt đầu bằng Know-Me MCP `initial` và dùng `help("tool.*")` hoặc `help("workflow.*")` khi cần chi tiết.
- `knowme mcp --stdio` expose Know-Me tools cho tasks, docs, memory, search, code, templates, và validation.
- `.agents/skills` expose Know-Me workflow skills như `kn-research`, `kn-plan`, `kn-flow`, và `kn-review` khi Hermes scan path này như external skill directory.

Hermes references:

- [Use MCP with Hermes](https://hermes-agent.nousresearch.com/docs/guides/use-mcp-with-hermes)
- [MCP Config Reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
- [Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)
- [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)

## Setup khuyên dùng

Trong một Know-Me project:

```bash
knowme init
knowme setup hermes
```

Hermes lưu MCP settings trong `~/.hermes/config.yaml`, nên kể cả project setup cũng ghi vào user-level Hermes config file. Scope vẫn là project vì Know-Me ghi `--project <repo-hiện-tại>` vào MCP server args.

`knowme setup hermes` tạo hoặc refresh:

- `AGENTS.md`
- `KNOWNS.md`
- `.agents/skills`
- `~/.hermes/config.yaml`

Hermes config sẽ trỏ Know-Me MCP server tới project hiện tại bằng `--project`, nên Hermes có thể chạy từ thư mục khác mà vẫn dùng đúng Know-Me store. Nếu chạy `knowme setup hermes` từ project khác, cùng entry `mcp_servers.known-me` sẽ được cập nhật sang project đó.

Dùng global setup nếu bạn muốn Hermes biết Know-Me ở mọi machine-level Hermes session:

```bash
knowme setup hermes --global
```

Global setup ghi `~/.hermes/config.yaml` với reusable `knowme mcp --stdio` server và `~/.agents/skills` làm external skill directory. Mode này không pin project; Know-Me resolve active project từ Hermes working directory hoặc từ MCP project selection.

## Manual config

Nếu muốn tự cấu hình Hermes, thêm đoạn này vào `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  knowns:
    command: "knowns"
    args: ["mcp", "--stdio", "--project", "/absolute/path/to/project"]

skills:
  external_dirs:
    - /absolute/path/to/project/.agents/skills
```

Nếu `knowns` chưa được install global, dùng `npx`:

```yaml
mcp_servers:
  knowns:
    command: "npx"
    args: ["-y", "knowns", "mcp", "--stdio", "--project", "/absolute/path/to/project"]
```

## Chạy Hermes

Chạy Hermes từ project:

```bash
hermes chat
```

Yêu cầu Hermes kiểm tra MCP tools:

```text
Tell me which MCP-backed tools are available right now.
```

Sau đó yêu cầu Hermes bắt đầu với Know-Me:

```text
Call Know-Me MCP initial, then use help("workflow.*") if you need workflow details.
```

## Working model

Hermes nên xem Know-Me là project working layer:

- gọi MCP `initial` khi bắt đầu session
- dùng `search` trước khi đọc project context rộng
- dùng `docs`, `tasks`, `memory`, `templates`, và `validate` qua MCP khi có thể
- dùng `code` tools cho code discovery và structural edits khi có thể
- chỉ fallback sang `knowns` CLI khi MCP không khả dụng

Skills không phải MCP tools. MCP tools xuất hiện như structured tools từ `knowns` MCP server; skills xuất hiện như Hermes slash commands khi Hermes index `external_dirs` đã cấu hình.

## Troubleshooting

- Nếu Hermes không thấy Know-Me tools, restart Hermes hoặc chạy `/reload-mcp`.
- Nếu MCP server mở sai project, chạy `knowme setup hermes` từ project root để generated config có `--project`.
- Nếu skills không hiện, kiểm tra `.agents/skills` tồn tại và đã nằm trong `skills.external_dirs`.
- Nếu `knowns` không có trong `PATH`, install lại Know-Me global hoặc dùng config dạng `npx`.
