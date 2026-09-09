# Validate

`knowme validate` kiểm tra tính nhất quán của project context hiện tại.

## Dùng để làm gì

Phát hiện:

- broken references
- quan hệ task/spec chưa đầy đủ
- drift giữa cấu trúc mong đợi và data thực tế

## Lệnh

```bash
knowme validate --plain
knowme validate --scope docs --plain
knowme validate --scope sdd --plain
knowme validate --strict --plain
```

## Khi nào chạy

- trước khi chốt task
- sau khi restructure docs
- sau khi đổi references hoặc generated files
- trước khi để AI dựa nhiều vào stored project context
