# Cài đặt

Cài `knowns` CLI trước. Việc cài đặt chỉ làm cho command khả dụng; bạn vẫn cần chạy `knowme init` trong từng repository muốn quản lý bằng Know-Me.

## Yêu cầu

- Terminal trên macOS, Linux, hoặc Windows
- Git (nếu muốn `knowme init` nhận diện repo)
- Tùy chọn: local model cho semantic search

## Nền tảng được hỗ trợ

| Nền tảng | Gói CLI | Local ONNX đi kèm |
| --- | --- | --- |
| macOS Apple Silicon | `darwin-arm64` | Có |
| macOS Intel (x86_64) | `darwin-x64` | Không |
| Linux x64 | `linux-x64` | Có |
| Linux ARM64 | `linux-arm64` | Có |
| Windows x64 | `win32-x64` | Có |

Trên macOS Intel, toàn bộ CLI và tìm kiếm từ khóa/BM25 vẫn hoạt động. Các thiết lập Local ONNX được tắt vì ONNX Runtime không còn cung cấp thư viện macOS x86_64 dựng sẵn tương thích. Để dùng semantic search, hãy chọn Ollama hoặc API tương thích OpenAI.

Người dùng nâng cao có thể chủ động đặt `KNOWN_ORT_LIB` trỏ đến `libonnxruntime.dylib` x86_64 tương thích; khi đó Know-Me sẽ bật lại provider Local ONNX.

## Homebrew

```bash
brew install hoangtrung1801/tap/knowme
```

Cách nên dùng trên macOS/Linux.

## npm

```bash
npm install -g @hoangtrung1801/knowme
```

Phù hợp nếu đã dùng Node tooling sẵn.

## Shell installer (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.sh | sh
```

## PowerShell installer (Windows)

```powershell
irm https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.ps1 | iex
```

## Build từ source

```bash
go build -o ./bin/knowme ./cmd/knowme
```

Dùng khi đang dev chính Know-Me.

## Kiểm tra

```bash
knowme --version
```

Nếu command in ra version, CLI đã cài xong. Tiếp theo, vào repository bạn muốn quản lý và chạy quick start.

## Không muốn cài global?

Chạy qua npx:

```bash
npx knowme init
```

## Tiếp theo

- [Quick start](./quick-start.md)
