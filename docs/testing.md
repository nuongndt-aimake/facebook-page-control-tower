# Kiểm thử và nghiệm thu

## Kiểm tra cú pháp

Project là frontend HTML/JS và Vercel Functions, không có test runner bắt buộc. Chạy tối thiểu:

```powershell
Get-ChildItem api -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --check analytics-runtime.js
node --check auth-nav.js
node --check report-sections.js
```

## Kiểm tra cấu trúc tài liệu/liên kết

```powershell
rg -n '\]\(([^)#]+)\)' README.md CONTRIBUTING.md docs
```

Mọi liên kết nội bộ phải tồn tại; không link tới `.env`, token, URL preview hoặc file dữ liệu cá nhân.

## Smoke test API

1. Đăng nhập Google trên production.
2. Mở `/api/auth/profile` bằng session hiện tại.
3. Mở báo cáo và xác nhận không có request Graph từ browser.
4. Chạy sync một Page, sau đó kiểm tra `sync_runs`, `pages`, `posts`, `metrics`.
5. Tạo một lỗi quyền giả lập hoặc Page không có token và xác nhận các Page khác vẫn hoàn thành.
6. Kiểm tra `401`, `403`, `400` bằng request thiếu/không hợp lệ.

## Ma trận quyền tối thiểu

| Vai trò | Đọc Page | Đọc nội dung | Đọc doanh thu | Đọc payout | Sync Page | Quản lý user |
| --- | --- | --- | --- | --- | --- | --- |
| viewer | được gán | được gán | không mặc định | không mặc định | không | không |
| analyst | được gán | được gán | được gán | theo cấp | không | không |
| operator | được gán | được gán | được gán | theo cấp | Page được gán | không |
| manager | tuyến dưới | tuyến dưới | tuyến dưới | theo access | Page tuyến dưới | hạn chế |
| platform_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |
| super_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |

## Responsive QA

Kiểm tra ít nhất 390px, 768px và desktop:

- menu mở được và nổi trên nội dung (`z-index` đúng);
- không có overlap header, label, chart hoặc button;
- bảng lớn chuyển thành card/list trên mobile, không ép cuộn ngang;
- bộ chọn nhiều có search, chọn tất cả, bỏ chọn tất cả, bộ đếm và lọc đang chọn;
- mọi màn hình có navigator thống nhất.

## Tiêu chí không đạt

- Có lỗi console chưa giải thích.
- Dữ liệu kỳ này hiển thị chung với kỳ khác.
- Dữ liệu rỗng bị trình bày như request thành công.
- Người không có payout access thấy số tiền.
- Token/secret xuất hiện trong HTML, response hoặc log.
