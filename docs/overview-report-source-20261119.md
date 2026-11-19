# Tổng quan dùng báo cáo vận hành — 2026-11-19

Trạng thái: Đang triển khai. Phát hiện nguyên nhân: `/analytics` vẫn nạp `analytics-runtime.js`/Chart.js và màn hình Meta cũ; widget báo cáo chỉ được thêm lên phía trên, chưa thay nguồn chính.

## Impact note và phạm vi chốt

- Thay nội dung `/analytics` bằng Tổng quan báo cáo: chọn kỳ, KPI số Page/phân công, số bài, doanh thu báo cáo/đã duyệt theo currency, thiếu báo cáo ngày cuối kỳ; bảng theo ngày, nhân sự và Page. Không hiển thị lượt xem/tương tác/trạng thái kiếm tiền/bài viết lấy từ Meta vì báo cáo thủ công không cung cấp các dữ liệu đó.
- Chỉ GET `/api/admin/access?endpoint=content_reports` với start/end/day; Làm mới chỉ đọc báo cáo. Không nạp runtime/API analytics đồng bộ, Chart.js hoặc nút gọi sync. Widget tự chèn bỏ qua `/analytics` để không tạo màn hình nguồn kép.
- Dùng access context/RBAC server hiện có: admin tất cả, manager tuyến quản lý, nhân viên/CTV trực tiếp. Không thêm quyền hoặc endpoint ghi. Báo cáo rejected không cộng vào tổng hợp; USD và VND cũ tách riêng, luỹ kế lấy báo cáo mới nhất mỗi phân công/currency.
- Route/menu Tổng quan giữ nguyên, liên kết tới Nộp báo cáo và Kho Inhouse. Empty/error/loading/đăng nhập đầy đủ; bảng chuyển thẻ cho màn hình nhỏ.
- Không migration, không thay dữ liệu/tài khoản/cron/domain/SePay hoặc bật Meta. Các route Meta cũ được giữ trong vùng lịch sử riêng, không dùng cho Tổng quan này.
- Cập nhật API/database/frontend/reporting/security/runbook/testing/deployment cùng thay đổi; kiểm tra số tổng/currency/rejected, scope API, không có lối gọi sync, responsive 390/768/desktop theo CSS và kiểm tra triển khai public.

## Lịch sử thay thế

Tổng quan Meta trên `/analytics` (META PAGE REPORTING, Đồng bộ lại, lượt xem/tương tác/nhóm kiếm tiền/Chart.js) **Hết hiệu lực ngày 2026-11-19**, thay bằng báo cáo vận hành trong bản này. File runtime/API và mô tả cũ được giữ để tra cứu; không xóa lịch sử hoặc sửa cron ngoài phạm vi.

Kiểm thử trước phát hành: 46 Node tests pass; 44 kiểm tra SQL (15 currency/payout + 17 operations + 12 profile/scope) chạy trong rollback transaction; 9 trường hợp API báo cáo pass, không giữ dữ liệu thử. Migration 20261119234000 đã áp dụng Supabase. Responsive code có breakpoint 390/768/desktop; kiểm tra trình duyệt sau phát hành được ghi riêng, không suy diễn từ test logic.
