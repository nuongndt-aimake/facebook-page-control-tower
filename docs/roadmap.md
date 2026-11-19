# Roadmap triển khai

Đợt 2026-11-19: nhập hàng loạt CSV/TSV, giá vốn 149 Page và nhân sự cùng bảng đã có code/migration/QA; đang phát hành. [Phạm vi và trạng thái](inventory-bulk-and-inline-assignees-20261119.md). Hoa hồng/Sheets/nhóm 2–4 vẫn theo roadmap riêng.

Đợt tiếp theo đã có code/migration/QA và đang phát hành: kho nghiệp vụ + hỏng/chi phí, tài sản Inhouse + payout/gán người, báo cáo CTV theo phân công và tổng quan, cấu hình giá/chiết khấu/mã/quà/hỗ trợ, menu viewport, đơn gọn/bộ lọc/phân bổ/nợ Page/bảo hành. [Phạm vi, trạng thái và kết quả](operations-inhouse-reports-20261119.md). Thông tin cũ nói các phần này chưa có được giữ làm lịch sử và **Hết hiệu lực riêng trong phạm vi đã nêu**. Hoa hồng, Google Sheet và nhóm 2–4 tiếp tục roadmap.

Gate 2.2 ngày 2026-11-19 đã triển khai code, migration và kiểm thử transaction nhập kho, giữ hàng cùng checkout, bán ngoài, chuyển Inhouse, giao nhân sự và ledger UI; đã phát hành production và nghiệm thu API thật. Ghi chú “Gate tiếp theo: intake transaction/Inhouse” bên dưới **Hết hiệu lực** với phần đã hoàn thành, thay bằng [bản phát hành và các phần còn chờ](inventory-fulfillment-release-20261119.md). Báo cáo/hoa hồng/Sheets và sản phẩm nhóm 2–4 vẫn theo lộ trình riêng, không tự đặt chính sách.

Đã phát hành 2026-11-19: webhook atomic và test hai phiên, giá public theo hiệu lực, bảng đủ cột đơn/kho, tên Page, menu active/tap/desktop. [Kế hoạch các luồng độc lập và kết quả](parallel-upgrade-20261119.md). Gate tiếp theo: intake transaction và các phần Inhouse/bàn giao/báo cáo còn Roadmap; không đánh dấu các phần đó hoàn tất chỉ vì bảng kho đã có tên.

> **Bổ sung 2026-11-19 — Roadmap nền tảng sản phẩm:** xem [sales-platform-rearchitecture-plan.md](sales-platform-rearchitecture-plan.md). Nhóm Fanpage là ưu tiên triển khai; Skill, khóa học và thuê bao giữ trạng thái `Roadmap`. Module đồng bộ Meta/Facebook được cách ly trong đợt tái cấu trúc catalog. Gate 1 đang ở mức `Thử nghiệm`, chưa mở bán hoặc thay menu cho người dùng; xem [nhật ký triển khai](sales-platform-implementation-log.md).

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
- Payout access: nhánh đọc theo access context đã triển khai; quyền Payout cũng mở Page liên kết với hồ sơ đó; thao tác ghi vẫn giới hạn admin, cần pilot với tài khoản manager có/không có quyền Payout.
- Admin preview chỉ đọc có token hết hạn, audit và nút trở về đã triển khai; cần tiếp tục kiểm thử nhiều tầng trên dữ liệu membership thực tế.
- **Line bán hàng Fanpage — Đang dùng từ 2026-11-19:** migration catalog/đơn hàng/payment event đã apply Supabase production; RLS/RBAC server-side, `/sales-orders`, bàn giao account → đơn hàng, `/sales`, `/api/checkout` và `/api/payments/sepay` đã ở Production. SePay Test Mode đã xác nhận webhook HTTP 200 và đơn `INHOUSE` 10.000 đ chuyển `paid`. SePay Live #73924 đã được phê duyệt, trỏ tới production và callback thử trả HTTP 200; giao dịch tiền thật đầu tiên vẫn cần theo dõi đối soát vận hành.

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

