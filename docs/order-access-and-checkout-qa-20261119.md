# Quyền đơn hàng và kiểm thử checkout — 2026-11-19

Trạng thái: Đang triển khai và kiểm thử.

Impact note: GET /api/admin/sales-orders mở cho tài khoản đã đăng nhập, lọc theo buyer_user_id hoặc phân công. Admin và quyền chủ động profiles.permissions.sales_orders=[read_all] xem toàn bộ. Hóa đơn/phân công/tổng hợp phải lọc cùng tập đơn; không trả dữ liệu cấu hình nhạy cảm cho người mua. /sales-orders bỏ chặn role admin ở UI; hành động thay đổi vẫn kiểm tra server. /users bổ sung quyền xem tất cả đơn. Không đổi cron, domain, SePay, môi trường. Dùng permissions JSON hiện có, không thêm role/bảng; quyền trực tiếp database hiện đóng/RLS giữ nguyên.

| Người dùng | Xem đơn | Thay đổi thanh toán/cấu hình |
| --- | --- | --- |
| Khách chưa đăng nhập | Không truy cập danh sách | Không |
| Người mua có tài khoản | Đơn buyer_user_id trùng tài khoản | Không |
| Người được phân công | Đơn được giao và đơn của mình | Theo action hiện hữu, không tự cấp quyền đối soát |
| Nhân viên có read_all | Tất cả đơn | Không tự động cấp quyền sửa |
| Platform/super admin | Tất cả đơn | Theo action quản trị |

Khách mua không đăng nhập không được nhận đơn dựa vào email tự khai. Không tự gán đơn cũ qua email. Việc nhận lại đơn khách cần luồng xác minh riêng, chưa triển khai.

Hết hiệu lực: quy ước chỉ admin vào màn hình đơn hàng trong frontend.md và các tài liệu trước. Ngày 2026-11-19 thay bằng ma trận trên; lịch sử giữ nguyên trong git. Quyền xem không đồng nghĩa quyền sửa/thu hồi/giao dịch tiền.

QA: tạo đơn thử được ghi rõ QA, không chuyển tiền thật; kiểm tra giá, chiết khấu, nội dung QR, tải ảnh, hạn thanh toán, bản ghi đơn/hóa đơn. Không đánh dấu paid khi chưa có giao dịch xác thực. Test negative ownership và read_all bằng dữ liệu giả. Cập nhật kết quả sau khi chạy.
