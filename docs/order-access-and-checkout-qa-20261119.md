# Quyền đơn hàng và kiểm thử checkout — 2026-11-19

Trạng thái: Đã phát hành production. Quyền xem đơn 441e967, tracking và sửa checkout 95b0931, báo giá đồng nhất và kiểm thử mở rộng dcff59a. Không nghiệm thu chuyển tiền thật trong phiên này.

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

## Hoàn tất kiểm thử và sửa bổ sung

- Đơn đăng nhập FS80B58299A8: 5 page, gốc 7.500.000đ, giảm 10% (750.000đ), phải trả 6.750.000đ. Tự lấy tên/email tài khoản; đã kiểm tra yêu cầu hóa đơn riêng và đủ thông tin trong modal quản lý. Chỉ là yêu cầu chờ, không phát hành hóa đơn thật.
- Theo dõi trạng thái live: sau khi hủy đơn test trong quản lý, trang QR tự đổi sang Đơn đã hủy và ẩn QR/tải ảnh/đồng hồ. Không đánh dấu paid hoặc hoàn tiền giả.
- Hai đơn QA được hủy để không đi vào bàn giao. Không xóa lịch sử test. Không chỉnh giá hiện hành hoặc giá tương lai đã có của người dùng.
- Báo giá public dùng POST /api/checkout với quote_only=true, chỉ đọc và trả tổng trước/sau chiết khấu/mã ưu đãi; không tạo đơn/hóa đơn. UI dùng cùng phép tính server để tránh INHOUSE bị hardcode 10.000đ sai khi mua nhiều page. Các mức 1/2/5/10 và ưu đãi tiền sau chiết khấu có test.
- Webhook không cho event sai/chi ra đến sau làm tụt đơn paid về cần đối soát. Kiểm thử giả xác nhận trạng thái paid được giữ nguyên; webhook chỉ nhận POST.
- Test tích hợp API giả: buyer không thấy hóa đơn khác, không thấy quà chưa trả, không sửa được thanh toán; nhân viên read_all xem mọi đơn nhưng không có quyền sửa; khách không có phiên bị 401. Token theo dõi sai/khác đơn/hết hạn bị từ chối.
- Kiểm thử chưa bao gồm chuyển tiền thật hoặc tình huống hai webhook đến đồng thời. Không khẳng định đã nghiệm thu các trường hợp này.

## Xác nhận cuối trên production

- Cả FSEBF9394C65 và FS80B58299A8 đã hủy, hóa đơn liên quan cancelled; giữ lịch sử, không phát hành hóa đơn/chuyển tiền/giao Page.
- Báo giá giao diện live 1/2/5/10: 1.500.000 / 2.850.000 / 6.750.000 / 12.750.000đ. Mã không tồn tại hiện lỗi và khóa tạo đơn. Không thay chính sách giá đã được người dùng thiết lập trong admin.
- SQL read-only xác nhận sales_orders, sales_invoice_records, sales_order_assignments: relrowsecurity=true; anon và authenticated đều không có SELECT trực tiếp. Backend lọc phạm vi qua service-role, không mở policy công khai.
- 9 kiểm thử Node đều đạt: sales-order-api.test.mjs, sales-checkout.test.mjs, sales-webhook.test.mjs, sales-order-policy.test.mjs, sales-order-tracking.test.mjs. Fetch giả không chạm database/giao dịch production.
- Kiểm tra trình bày /sales trên IAB với kích thước thực 390px và 768px, không tràn ngang; desktop không tràn. Chrome không áp dụng được viewport override trong lượt kiểm thử này nên không dùng số đo Chrome để khẳng định QA mobile.
- Còn phụ thuộc: URL video admin hiện rỗng; kiểm thử ngân hàng/SePay thật và cuộc đua webhook đồng thời chưa thực hiện. Không tự đổi quyền của tài khoản nhân viên đang hoạt động để test; quyền read_all được kiểm thử bằng mock API, checkbox live và negative test bằng preview viewer.
