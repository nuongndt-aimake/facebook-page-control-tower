# Sửa hiển thị trang bán Fanpage — 2026-11-19

Trạng thái: Đã triển khai mã nguồn. API production xác nhận giá hiện hành 1.500.000đ và video chưa cấu hình (URL trống). Video phải được admin lưu trong hệ thống, không hardcode trong HTML.

Trang /sales-orders bổ sung form video và giá có ngày hiệu lực, dùng các action server sẵn có `save_sales_setting` và `set_product_price`. Quyền server tiếp tục giới hạn platform_admin/super_admin. Lịch sử giá được thêm bản ghi mới, không ghi đè/xóa giá cũ. Sửa lỗi cú pháp template chi tiết hóa đơn khiến trang quản lý đơn hàng không chạy. API/database/RLS không đổi.

Impact note: UI /sales và thứ tự tải CSS chung khi trang có thiết kế riêng. Không đổi API, bảng, migration, RLS, role, cron, domain hay cấu hình thanh toán. Navigator chung tiếp tục hoạt động. Giá lấy từ API sales-config theo giá có hiệu lực; chiết khấu hiện hành 1 page: niêm yết, 2–4: 5%, 5–9: 10%, từ 10: 15%; máy chủ tiếp tục xác nhận khi tạo đơn.

Bỏ các chú thích bị gạch đỏ: mô tả dưới tiêu đề, badge SePay, menu phụ cũ, nhãn khách lẻ và nhãn SePay trên hai thẻ, mô tả sinh QR và chú thích kỹ thuật về chiết khấu. Bỏ công khai mã thử nghiệm INHOUSE. Giữ bảo mật dưới nút tạo đơn và chức năng QR/tải QR/đếm ngược.

CSS navigator được tải trước thiết kế riêng, tránh ghi đè màu chữ, giá và tiêu đề trên nền trắng. Giá, chiết khấu và hướng dẫn video dùng màu tương phản rõ. Giá trị CSS trước thay đổi trong commit 7012e79 hết hiệu lực vì gây mất tương phản trên /sales.

Video tiếp tục đọc cấu hình admin `profile_link_help_video`; chỉ hiện liên kết khi có URL thực tế, không tự đặt video khác. Nếu chưa được cấu hình, hiện trạng thái đang cập nhật. Cần URL đã được duyệt để hoàn tất nội dung.

Kiểm thử: cú pháp script, /sales desktop/768px/390px, giá/chiết khấu hiển thị; không tạo đơn hoặc chuyển tiền trong kiểm thử trình bày.
