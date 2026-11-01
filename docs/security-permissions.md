# Auth, RBAC và admin preview

## Auth

- Google OAuth qua Supabase.
- Callback production: `/analytics`.
- Tài khoản mới bắt đầu ở trạng thái `viewer` hoặc role đã cấu hình.
- Tài khoản suspended/deleted không được truy cập API.

## Quyền

Quyền cần tách theo domain:

- xem Page;
- xem nội dung;
- xem doanh thu;
- xem payout;

## Kế thừa tuyến quản lý

Manager/lead xem được người tuyến dưới đang active và tài sản được gán cho họ. Page kế thừa phải được đánh dấu `inherited` trong access context/báo cáo; Page gán trực tiếp là `direct`, nếu có cả hai nguồn là `direct_and_inherited`. Tuyến dưới không được tự động nhận quyền ngược lên tuyến trên. Khi membership kết thúc, lần dựng access context kế tiếp loại người đó và tài sản đó khỏi phạm vi kế thừa.
- đồng bộ;
- sửa nhóm;
- quản lý nhân sự;
- cấp quyền tài chính.

Tuyến trên chỉ thấy dữ liệu tuyến dưới khi có membership active và không tự động có quyền ghi.

## Admin preview — roadmap

Chế độ admin xem trước là yêu cầu roadmap. Code hiện tại chưa có endpoint hoàn chỉnh để chuyển access context sang người dùng được chọn và chưa có bảng `admin_audit_logs`. Khi triển khai, phải dùng server-side access context, chỉ đọc, không dùng token của người dùng, không được đồng bộ/cấp quyền/xóa và phải ghi audit.

