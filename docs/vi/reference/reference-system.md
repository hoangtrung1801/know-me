# Reference system

Knowns hỗ trợ structured references giữa task, doc, memory, và template.

## Các dạng phổ biến

- `@task-abc123`
- `@doc/guides/setup`
- `@memory-xyz789`
- `@template/react-component`

## Doc suffixes

- `@doc/path:42` — dòng cụ thể
- `@doc/path:10-20` — range
- `@doc/path#heading-slug` — heading

## Tại sao cần reference

Reference giúp navigate giữa các entity mà không cần nhớ path hay ID.

## Lệnh liên quan

```bash
knowns resolve "@doc/specs/auth{implements}" --plain
knowns search "authentication" --plain
knowns retrieve "how auth works" --json
```
