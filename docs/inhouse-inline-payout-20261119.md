# Cấp payout ngay danh sách Inhouse — 2026-11-19

Trạng thái: Đang triển khai.

Impact note: Kho Inhouse hiển thị payout hiện hành trên cùng dòng Page và nút thiết lập/đổi payout cho người được cấp `manage_payout`. Cửa sổ tại chỗ dùng chung với báo cáo ngày, cho chọn hồ sơ USD active hoặc tạo mới; lưu xong tải lại danh sách, giữ bộ lọc. Không chuyển trang. GET/POST `inhouse_assets` và RPC `inhouse_payout_save` hiện có kiểm tra quyền server-side, phạm vi Page, lịch sử thay đổi. Không thêm role, migration, env, domain, cron hay sửa dữ liệu cũ. Không tự cấp quyền cho người dùng chưa được ủy quyền. Mobile dùng thẻ và dialog cuộn trong viewport; kiểm tra 390/768/desktop. API/database/security giữ cơ chế hiện có; frontend/runbook/testing cập nhật trong cùng commit.

Kiểm thử trước phát hành: 46 Node tests pass; 44 kiểm tra SQL (15 currency/payout + 17 operations + 12 profile/scope) chạy trong rollback transaction; 9 trường hợp API báo cáo pass, không giữ dữ liệu thử. Migration 20261119234000 đã áp dụng Supabase. Responsive code có breakpoint 390/768/desktop; kiểm tra trình duyệt sau phát hành được ghi riêng, không suy diễn từ test logic.
