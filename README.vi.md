<p align="center">
  <img src="./images/logo.png" alt="Know-Me" width="120">
</p>

<h1 align="center">Know-Me</h1>

<p align="center">
  <strong>Ngừng giải thích lại dự án cho AI coding agent mỗi khi mở session mới.</strong>
</p>

<p align="center">
  <sub>Lớp bộ nhớ local-first · Task · Tài liệu · Quyết định kỹ thuật · Git-friendly · MCP</sub>
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./docs/vi/README.md">Tài liệu</a>
</p>

---

Mỗi lần mở session AI coding mới, bạn lại phải copy-paste ngữ cảnh, giải thích lại kiến trúc và nhắc agent về các quyết định kỹ thuật đã thống nhất. Ngữ cảnh trôi dạt trong lịch sử chat, còn agent liên tục mất phương hướng.

**Know-Me giải quyết điều đó.** Đây là lớp bộ nhớ local-first cho các dự án phần mềm làm việc cùng AI. Lưu trữ task, tài liệu, quyết định kỹ thuật và ngữ cảnh dự án ngay trong các file mã nguồn (Markdown + JSON) mà cả bạn, team và AI agent đều có thể trực tiếp kiểm tra và cập nhật qua MCP.

<p align="center">
  <img src="./images/screenshot-dashboard.png" alt="Không gian làm việc Know-Me Dashboard" width="100%">
</p>

<p align="center">
  <img src="./images/screenshot-kanban.png" alt="Bảng Kanban Know-Me" width="100%">
</p>

## Mục lục

- [Tại sao cần Know-Me?](#tại-sao-cần-know-me)
- [Trước và sau](#trước-và-sau)
- [Know-Me là gì?](#know-me-là-gì)
- [Cách hoạt động](#cách-hoạt-động)
- [Khả năng chính](#khả-năng-chính)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cài đặt](#cài-đặt)
- [Tài liệu](#tài-liệu)
- [Phát triển](#phát-triển)
- [Liên kết](#liên-kết)

## Tại sao cần Know-Me?

Công việc của bạn nên dễ tìm và dễ tiếp tục.

- Lên kế hoạch cho dự án mà không làm thất lạc các công việc liên quan.
- Lưu một URL hữu ích trước khi nó chìm giữa các tab đang mở.
- Ghi lại ý nghĩ nhanh mà không phải biến nó thành một tài liệu dài.
- Giữ không gian làm việc local-first và do bạn kiểm soát.

## Trước và sau

| Không có Know-Me | Có Know-Me |
|---|---|
| Việc cần làm nằm rải rác trong note và chat | Dự án gom các công việc liên quan |
| Trang hữu ích thành bookmark bị quên lãng | Link đã lưu tạo thành một thư viện chung |
| Ý nghĩ nhanh biến mất trước khi bạn hành động | Memo lưu lại chúng trong vài giây |
| Mất thời gian dựng lại ngữ cảnh công việc | Không gian làm việc sẵn sàng khi bạn quay lại |

## Know-Me là gì?

Know-Me là **không gian làm việc năng suất local-first, tự host được**. Nó giúp bạn tổ chức dự án và công việc, lưu link hữu ích, và ghi chú nhanh mà vẫn giữ quyền kiểm soát dữ liệu.

Dự án là nơi tập hợp các công việc liên quan. Link đã lưu và memo là dữ liệu toàn cục, nên luôn có sẵn ở mọi dự án.

<p align="center">
  <img src="./images/how-knowns-works.png" alt="Không gian làm việc Know-Me" width="100%">
</p>

## Cách hoạt động

1. **Tạo dự án** để tổ chức các công việc liên quan.
2. **Theo dõi công việc** và tiến độ của chúng trong dự án đó.
3. **Lưu link và memo** bất cứ khi nào có thứ đáng giữ lại.
4. **Quay lại không gian làm việc** bằng CLI hoặc Web UI.

Ghi lại đơn giản. Ưu tiên rõ ràng. Ít thất lạc ngữ cảnh hơn.

## Khả năng chính

| 🗂️ Dự án | ✅ Công việc | 🔗 Liên kết đã lưu | ✍️ Memo |
|---|---|---|---|
| Gom các việc liên quan vào một nơi. | Biến dự định thành bước tiếp theo rõ ràng. | Giữ URL hữu ích trong một thư viện chung. | Ghi lại ý nghĩ trước khi nó biến mất. |

### Thử ngay

```bash
# Bắt đầu không gian làm việc cho dự án
knowme init

# Thêm một công việc
knowme task create "Lập kế hoạch ra mắt" --ac "Xác định mốc đầu tiên"

# Lưu thông tin hữu ích
knowme link add "https://example.com/article"
knowme memo add "Hỏi Sam về mốc thời gian ra mắt"
```

## Bắt đầu nhanh

Phiên làm việc đầu tiên chỉ cần năm bước nhỏ:

1. Cài Know-Me.
2. Tạo hoặc đăng ký không gian làm việc cho dự án.
3. Thêm một công việc bạn muốn hoàn thành.
4. Lưu một link hữu ích và một memo nhanh.
5. Mở không gian làm việc trên trình duyệt.

```bash
# Cài đặt
brew install hoangtrung1801/tap/knowme
# hoặc: npm install -g @hoangtrung1801/knowme
# hoặc: curl -fsSL https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.sh | sh

# Tạo hoặc đăng ký không gian làm việc cho dự án
mkdir du-an-cua-toi
cd du-an-cua-toi
knowme init

# Thêm việc cho dự án
knowme task create "Chọn ngày ra mắt" --ac "Xác nhận ngày"

# Lưu thông tin hữu ích cho sau này
knowme link add "https://example.com/launch-checklist"
knowme memo add "Xem lại checklist vào thứ Sáu"

# Mở không gian làm việc trên trình duyệt
knowme browser --open
```

## Cài đặt

### Homebrew (macOS/Linux)

```bash
brew install hoangtrung1801/tap/knowme
```

### Shell installer (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.sh | sh
```

### PowerShell installer (Windows)

```powershell
irm https://raw.githubusercontent.com/hoangtrung1801/know-me/main/install/install.ps1 | iex
```

### npm

```bash
npm install -g @hoangtrung1801/knowme
```

### Từ mã nguồn

Cần Go 1.24.2+.

```bash
go install github.com/hoangtrung1801/know-me/cmd/knowme@latest
```

## Tài liệu

| Hướng dẫn | Mô tả |
|---|---|
| [Hướng dẫn sử dụng](./docs/vi/guides/user-guide.md) | Bắt đầu và sử dụng hằng ngày |
| [Tham chiếu lệnh](./docs/vi/reference/commands.md) | Các lệnh CLI và ví dụ |
| [Web UI](./docs/vi/guides/web-ui.md) | Không gian làm việc, bảng việc, link và memo |
| [Cấu hình](./docs/vi/reference/configuration.md) | Thiết lập và tùy chọn dự án |
| [Đóng góp](./CONTRIBUTING.md) | Đóng góp cho Know-Me |

## Phát triển

Cần Go 1.24.2+ và tùy chọn Node.js + pnpm để phát triển UI.

```bash
make build
make test
make test-e2e
make lint
make ui
```

## Liên kết

- [npm](https://www.npmjs.com/package/@hoangtrung1801/knowme)
- [GitHub](https://github.com/hoangtrung1801/know-me)
- [Discord](https://discord.knowns.dev)
- [Releases](https://github.com/hoangtrung1801/know-me/releases)
