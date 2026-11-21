# Tên hiển thị tự phục vụ — 2026-11-20

Trạng thái: `Đang dùng` sau khi migration `20261120103000_profile_display_name_self_service.sql` được áp dụng vào đúng Supabase production `tlcjcqqnfjrqsoiaalfk` và bản Vercel cùng thay đổi được phát hành.

## Impact note

| Vùng | Tác động |
| --- | --- |
| Chức năng | Tài khoản đã đăng nhập đổi được tên hiển thị của chính mình tại `/account`; email chỉ đọc. |
| API | `PATCH /api/auth/profile` nhận thêm `display_name`; từ chối `email`, role, permissions, ID và mọi trường không nằm trong allow-list. |
| Database | RPC `profile_self_save` khóa đúng bản ghi `profiles` của session, cập nhật atomic và ghi audit `self_profile_update`. Không đổi bảng hoặc dữ liệu cũ. |
| Phân quyền | Chỉ session active sửa chính mình. Server lấy actor từ token; không có API sửa tên tài khoản khác. Preview tiếp tục chỉ đọc. |
| UI | `/account` có Tên hiển thị, Email đăng nhập read-only, Số điện thoại, Profile Facebook. Tên cập nhật lại header ngay khi lưu thành công. |
| Responsive | Form một cột, input 42px; cần nghiệm thu 390px/768px/desktop trên deployment. |
| Tích hợp | Không đổi Google OAuth callback, domain, SePay, Meta, cron hay secret. |

## Ràng buộc và tương thích

- Tên được chuẩn hóa khoảng trắng, dài 2–120 ký tự, cấm ký tự điều khiển.
- Email là định danh do Google/Supabase Auth quản lý; không đổi qua hồ sơ ứng dụng.
- RPC cũ `profile_contacts_save` giữ lại để bảo toàn lịch sử và tương thích cho bản phát hành cũ; endpoint mới dùng `profile_self_save`.
- Nếu migration chưa có trên production, không được phát hành endpoint mới độc lập vì thao tác lưu sẽ lỗi RPC.

## Kiểm thử

- Unit/API: tên chuẩn hóa; tên, URL, phone không hợp lệ bị từ chối; role/email/ID không được chuyển tới RPC; actor luôn lấy từ session.
- Production sau deploy: đăng nhập thật → đổi tên → tải lại `/account`, kiểm tra email không đổi và audit chỉ lưu tên trường thay đổi, không lưu dữ liệu nhạy cảm.
