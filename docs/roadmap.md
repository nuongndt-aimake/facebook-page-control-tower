# Roadmap triển khai

## P0 — Nền tảng và an toàn

- Chuẩn hóa migration và backup.
- Bảo mật token/secret.
- Hoàn thiện Auth, RBAC, RLS.
- Registry Page/BM/connection bất biến.

## P1 — Đồng bộ ổn định

- Lịch động active/inactive.
- Queue, lock, retry, dead-letter.
- Snapshot Page, nội dung và doanh thu.
- Health check và audit log.

## P2 — Báo cáo

- Tách Page, nội dung, doanh thu, payout, hoa hồng.
- Lọc, tìm kiếm, phân trang, group và kỳ dữ liệu.
- Đối soát nguồn API/manual/reconciled.

## P3 — Quản trị

- Nhân sự, tuyến quản lý, bàn giao.
- Payout access.
- Admin preview chỉ đọc.

## P4 — UX và mở rộng

- Navigator thống nhất.
- Mobile card layout.
- Dọn UI trùng/lỗi.
- Staging, pilot 5 → 20 → 50 Page.

## Tiêu chí nghiệm thu

- Slot tắt không chạy.
- Không có job trùng.
- Một Page lỗi không làm dừng phiên.
- Báo cáo không gọi Meta trực tiếp.
- Người dùng chỉ thấy dữ liệu được cấp.
- Có thể truy vết và retry từng request.

