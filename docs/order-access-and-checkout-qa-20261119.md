# Quyền đơn hàng và kiểm thử checkout — 2026-11-19

Trạng thái: Quyền xem đơn đã phát hành 441e967; các sửa bổ sung và kết quả kiểm thử ghi dưới đây.

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

## Kết quả và phần tiếp theo

- Live: tạo đơn guest FSEBF9394C65 (QA KIEM THU KHONG GIAO HANG), 2 page, giá gốc 3.000.000đ, giảm 5% = 150.000đ, phải trả 2.850.000đ. QR MBBank/VA VQRQANSMJ6468/nội dung FSEBF9394C65/số tiền 2850000 tải và hiển thị được; download QR-FSEBF9394C65.png thành công. Đồng hồ 15 phút hoạt động.
- Live: đơn xuất hiện trên /sales-orders của admin cùng hóa đơn gộp pending_payment. Xem trước tài khoản viewer khác trả 0 đơn, không có hóa đơn/cấu hình của người khác. Form quyền nhân sự có checkbox xem tất cả đơn.
- Automated: owner/assignee/admin/read_all/revoke/malformed permissions; webhook đúng xác thực + đúng tiền -> paid và aggregate_pending; replay event -> duplicate; thiếu tiền -> reconciliation_required; sai xác thực -> 401 và không ghi. Chạy bằng fetch giả, không gửi webhook giả vào production.
- Sửa qua QA: khóa nút tạo đơn sau thành công; tổng hợp cuối ngày chỉ nhận aggregate_pending/aggregated; không đưa đơn chưa trả vào tổng hợp. Phiên không hợp lệ không âm thầm chuyển thành đơn guest.
- Tiếp tục chức năng đã chốt: theo dõi trạng thái QR mỗi 5 giây qua GET /api/admin/access?endpoint=public-order-status&order_id=... và header x-order-token. Token HMAC gắn order_id, hạn 24 giờ, dùng bí mật server, không lưu bí mật vào client. Response chỉ trả trạng thái/mã/số tiền; không trả PII. 403 nếu sai token, không dựa trên mã đơn dễ chia sẻ để đọc dữ liệu cá nhân. Khi paid, mới trả link quà; checkout không tiết lộ link tải quà trước thanh toán. QR/countdown ẩn khi paid/hủy/hết hạn.
- Đơn 0 đồng chỉ tài khoản nhân viên trong salesStaffRoles được tạo; không có QR và chờ xác minh staff. Không cấp quyền mới cho người mua. Không thay đổi schema/RLS hoặc thêm function Vercel; các module hỗ trợ nằm ngoài api/.
- Chưa xác nhận bằng chuyển tiền thật hoặc webhook thật trong phiên này. Đơn test để chờ/hủy, không được bàn giao. Video admin vẫn chưa có URL.
