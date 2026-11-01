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

## Admin preview — đã triển khai có kiểm soát

`platform_admin`/`super_admin` có thể tạo phiên xem trước 15 phút qua `/api/admin/preview`. Mỗi request dùng session Supabase của quản trị viên kèm preview token ký server-side; server dựng access context của tài khoản đích, không dùng token của tài khoản đích. Chế độ này chỉ đọc, chặn các thao tác POST quản trị/đồng bộ, có banner và nút trở về góc nhìn quản trị viên. Mỗi lần bắt đầu được ghi vào `admin_audit_logs`.

