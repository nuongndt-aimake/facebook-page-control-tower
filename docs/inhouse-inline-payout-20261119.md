# Cấp payout ngay danh sách Inhouse — 2026-11-19

Trạng thái: Đang dùng.

Impact note: Kho Inhouse hiển thị payout hiện hành trên cùng dòng Page và nút thiết lập/đổi payout cho người được cấp `manage_payout`. Cửa sổ tại chỗ dùng chung với báo cáo ngày, cho chọn hồ sơ USD active hoặc tạo mới; lưu xong tải lại danh sách, giữ bộ lọc. Không chuyển trang. GET/POST `inhouse_assets` và RPC `inhouse_payout_save` hiện có kiểm tra quyền server-side, phạm vi Page, lịch sử thay đổi. Không thêm role, migration, env, domain, cron hay sửa dữ liệu cũ. Không tự cấp quyền cho người dùng chưa được ủy quyền. Mobile dùng thẻ và dialog cuộn trong viewport; kiểm tra 390/768/desktop. API/database/security giữ cơ chế hiện có; frontend/runbook/testing cập nhật trong cùng commit.

Kiểm thử trước phát hành: 46 Node tests pass; 44 kiểm tra SQL (15 currency/payout + 17 operations + 12 profile/scope) chạy trong rollback transaction; 9 trường hợp API báo cáo pass, không giữ dữ liệu thử. Migration 20261119234000 đã áp dụng Supabase. Responsive code có breakpoint 390/768/desktop; kiểm tra trình duyệt sau phát hành được ghi riêng, không suy diễn từ test logic.

Phát hành production: commit a4a41031c18bd77a48c63ad26e8b0c401000f8ac, Vercel 7sti5J2hYjZeZmia12dU9jXHC279 success; HTTP canonical money.aiecom.vn đã xác nhận module mới trả 200, Tổng quan không nạp analytics-runtime. Browser đã thấy ô báo cáo editable và payout trên từng dòng Inhouse. Bổ sung gọn icon/ý nghĩa duyệt: xem [tài liệu nối tiếp](report-verification-and-compact-actions-20261119.md).
