# Banner bán hàng và lịch giá — 2026-11-19

Trạng thái: Đã triển khai mã nguồn; phát hành cùng commit chứa tài liệu này.

## Impact note

- UI: /sales tách `.sales-hero` khỏi `.hero` toàn cục, nền sáng và tiêu đề xanh đậm. /sales-orders bổ sung giá hiệu lực, lịch sử và giá lên lịch theo từng sản phẩm; giờ hiển thị Asia/Ho_Chi_Minh.
- API/action: giữ GET /api/admin/sales-orders và POST set_product_price/save_sales_setting; không đổi payload. UI cấu hình kiểm tra profile platform_admin/super_admin; server tiếp tục kiểm tra quyền cho mọi thao tác.
- Database/RLS/migration: không đổi, giữ nguyên lịch sử sales_product_prices; không chỉnh dữ liệu giá production để kiểm thử.
- Role, cron, domain, môi trường, SePay và Supabase: không thay đổi cấu hình.
- Kiểm thử: cú pháp JS, banner và không tràn tại desktop/768/390; lịch giá chọn bản mới nhất có effective_from không vượt hiện tại, giá tương lai chưa áp dụng.

## Thiết kế và luồng

Admin chọn sản phẩm → xem giá đang hiệu lực và các mốc giá → nhập mức giá/ngày bắt đầu → lưu bản ghi mới → đọc lại lịch. Giá bán công khai vẫn do máy chủ chọn theo thời điểm hiệu lực. Video đọc cấu hình admin profile_link_help_video, không hardcode. Hiện URL video đang trống nên giao diện báo đang cập nhật.

## Lịch sử

Hết hiệu lực ngày 2026-11-19: banner /sales dùng class hero chung (commit 0a76fc4 và trước đó). Lý do: nền gradient toàn cục làm tiêu đề xanh đậm khó đọc. Thay thế: class sales-hero trong commit chứa tài liệu này. Giữ nguyên toàn bộ nội dung và luồng thanh toán.
