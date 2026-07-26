# Validate

`knowns validate` kiểm tra tính nhất quán của project context hiện tại.

## Dùng để làm gì

Phát hiện:

- broken references
- quan hệ task/spec chưa đầy đủ
- drift giữa cấu trúc mong đợi và data thực tế

## Lệnh

```bash
knowns validate --plain
knowns validate --scope docs --plain
knowns validate --scope sdd --plain
knowns validate --strict --plain
```

## Khi nào chạy

- trước khi chốt task
- sau khi restructure docs
- sau khi đổi references hoặc generated files
- trước khi để AI dựa nhiều vào stored project context
