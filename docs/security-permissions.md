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
- đồng bộ;
- sửa nhóm;
- quản lý nhân sự;
- cấp quyền tài chính.

Tuyến trên chỉ thấy dữ liệu tuyến dưới khi có membership active và không tự động có quyền ghi.

## Admin preview — roadmap

Chế độ admin xem trước là yêu cầu roadmap. Code hiện tại chưa có endpoint hoàn chỉnh để chuyển access context sang người dùng được chọn và chưa có bảng `admin_audit_logs`. Khi triển khai, phải dùng server-side access context, chỉ đọc, không dùng token của người dùng, không được đồng bộ/cấp quyền/xóa và phải ghi audit.

