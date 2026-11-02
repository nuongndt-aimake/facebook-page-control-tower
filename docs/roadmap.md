# Roadmap triển khai

Kế hoạch thực thi có dependency và workstream song song được chuẩn hóa tại [implementation-plan.md](implementation-plan.md).

Ưu tiên hiện tại là emergency sprint tối đa 48 giờ; các hạng mục chưa đủ điều kiện sẽ giữ trạng thái `Roadmap` và không được mô tả là đã hoàn thành.

## Baseline production đã đối chiếu

Đối chiếu ngày 2026-11-02: các thay đổi menu và scheduler đã được push lên `origin/main` tại commit `e210126`; deployment production gần nhất được tạo bằng Vercel inspect URL `https://vercel.com/aimake/facebook-page-control-tower/8hysrrnL2XJyJTosJJgtPGNa9eHS`. Gồm:

- module boundary và giới hạn Function;
- navigator hai lớp theo module, responsive mobile/desktop và xử lý submenu không overlap;
- quan hệ quản lý–nhân viên một-nhiều, bulk selector và bulk API;
- tài liệu API/frontend/module map tương ứng.

Không còn commit tính năng đã nằm trên `main` nhưng chưa được phát hành. Phần còn thiếu dưới đây là hạng mục chưa hoàn tất về nghiệp vụ hoặc chưa đủ điều kiện bật rộng, không phải lỗi đồng bộ Git/Vercel.

## P0 — Nền tảng và an toàn

- Chuẩn hóa migration và backup.
- Bảo mật token/secret.
- Hoàn thiện Auth, RBAC, RLS.
- Registry Page/BM/connection bất biến.
- Mã hóa hoặc chuyển token Meta sang secret store; token OAuth mới đã được mã hóa AES-256-GCM khi `META_TOKEN_ENCRYPTION_KEY` được cấu hình. Token cũ vẫn tương thích và sẽ được chuyển khi authorize lại.

## P1 — Đồng bộ ổn định

- Lịch động active/inactive.
- Queue, lock, retry, dead-letter.
- Snapshot Page, nội dung và doanh thu; worker bài viết cho phép xếp hàng và làm mới có chủ đích theo bộ lọc.
- Health check và audit log.
- Worker sử dụng `sync_schedule_slots`, queue/lock/attempt/dead-letter và snapshot daily; control-plane, migration snapshot và dispatcher đã có, pilot 5 Page đạt. Ba slot mặc định đã seed nhưng đang inactive; đồng bộ hàng loạt vẫn chưa bật.

## P2 — Báo cáo

- Tách Page, nội dung, doanh thu, payout, hoa hồng.
- Lọc, tìm kiếm, phân trang, group và kỳ dữ liệu.
- Đối soát nguồn API/manual/reconciled.

## P3 — Quản trị

- Nhân sự, tuyến quản lý, bàn giao.
- Báo cáo kế thừa theo tuyến: người quản lý thấy người tuyến dưới và toàn bộ Page/Payout được gán, có nhãn trực tiếp/kế thừa.
- Màn hình `/team`, bảng `user_reporting_lines`, bulk selector, bulk API và bàn giao successor đã ở production; cần pilot với cặp người dùng thực tế và kiểm tra audit sau thao tác.
- Payout access.
- Admin preview chỉ đọc có token hết hạn, audit và nút trở về đã triển khai; cần tiếp tục kiểm thử nhiều tầng trên dữ liệu membership thực tế.

## P4 — UX và mở rộng

- Navigator thống nhất hai lớp theo module đã ở production.
- Mobile card layout và submenu responsive đã ở production.
- Dọn UI trùng/lỗi: tiếp tục audit từng màn hình, không coi đã hoàn thành toàn bộ chỉ vì shell chung đã ổn định.
- Staging, pilot 5 → 20 → 50 Page.

## Tiêu chí nghiệm thu

- Slot tắt không chạy.
- Không có job trùng.
- Một Page lỗi không làm dừng phiên.
- Báo cáo không gọi Meta trực tiếp.
- Người dùng chỉ thấy dữ liệu được cấp.
- Có thể truy vết và retry từng request.
- Tài liệu API, cấu hình, route, test và release checklist khớp với code.

