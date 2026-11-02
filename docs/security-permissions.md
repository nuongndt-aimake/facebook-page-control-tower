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

Manager/lead xem được người tuyến dưới đang active và tài sản được gán cho họ. Page kế thừa phải được đánh dấu `inherited` trong access context/báo cáo; Page gán trực tiếp là `direct`, nếu có cả hai nguồn là `direct_and_inherited`. Hồ sơ tuyến hiển thị cả người quản lý trực tiếp, vai trò hiện tại, số Page/Payout và số tuyến dưới. Khi bàn giao, Page/Payout và các tuyến quản lý liên quan phải chuyển sang successor; tuyến dưới không được tự động nhận quyền ngược lên tuyến trên.

Màn hình Payout đọc qua `/api/admin/access?endpoint=payout` để áp dụng cùng access context. Người quản lý chỉ thấy Page và hồ sơ Payout trực tiếp/kế thừa đã được cấp; không có `payment_profile_access` thì không thấy hồ sơ hoặc dữ liệu thanh toán. Các thao tác tạo/sửa/gắn/cấp quyền vẫn yêu cầu `platform_admin` hoặc `super_admin`.
- đồng bộ;
- sửa nhóm;
- quản lý nhân sự;
- cấp quyền tài chính.

Tuyến trên chỉ thấy dữ liệu tuyến dưới khi có membership active và không tự động có quyền ghi.

## Admin preview — đã triển khai có kiểm soát

`platform_admin`/`super_admin` có thể tạo phiên xem trước 15 phút qua `/api/admin/preview`. Mỗi request dùng session Supabase của quản trị viên kèm preview token ký server-side; server dựng access context của tài khoản đích, không dùng token của tài khoản đích. Chế độ này chỉ đọc, chặn các thao tác POST quản trị/đồng bộ, có banner và nút trở về góc nhìn quản trị viên. Mỗi lần bắt đầu được ghi vào `admin_audit_logs`.

Luồng khởi tạo phải đi từ nút **Xem trước** trên đúng dòng tài khoản ở `/users`. Nút gửi trực tiếp `user_id` và `user_email` tới endpoint (không suy diễn ID từ nội dung hiển thị), lưu token vào session storage và cookie 15 phút, rồi chuyển tới `/analytics?preview=1`. Nút không xuất hiện cho chính tài khoản quản trị viên đang đăng nhập; tài khoản `suspended`/`deleted` bị từ chối. Khi đang preview, banner cố định cho phép thoát và xóa cả token trong storage/cookie. Banner có vùng đệm cuối trang để không che bảng hoặc danh sách trên desktop/mobile; hai lớp banner global/runtime tự loại trùng.

