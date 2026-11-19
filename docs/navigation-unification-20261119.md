# Đồng bộ navigator toàn hệ thống — 2026-11-19

Trạng thái: Đã phát hành production (68a511b). Menu chung xác nhận tại /, /sales, /account, /sales-orders, /operations, /lo-trinh, /privacy. Trang giới thiệu, mua hàng và tài khoản đạt kiểm tra không tràn ngang tại 390px, 768px và desktop.

Bổ sung kiểm thử: nếu thu hồi phiên trên máy chủ gặp lỗi, thử đăng xuất phạm vi local; chỉ chuyển tới đăng nhập khi phiên đã được xóa. Nếu phiên vẫn tồn tại, cho thử lại. Điều này xử lý cả phiên hết hạn đã bị máy chủ từ chối.

## Impact note

- Chức năng/UI: toàn bộ 32 HTML gốc, gồm giới thiệu/chương trình, lộ trình, đăng ký, mua hàng, chính sách và các màn hình quản lý, tải cùng `auth-nav.js?v=20261119-all-menu`.
- API, database/migration, RLS, role, cron: không đổi. Các quyền server-side hiện có tiếp tục áp dụng; menu không cấp quyền truy cập dữ liệu.
- Cấu hình: giữ dự án `aimake/facebook-page-control-tower` và địa chỉ chính `https://money.aiecom.vn`; không thay DNS hoặc Supabase.
- Tài liệu: tài liệu này và frontend.md. Không cần backfill dữ liệu.

## Thiết kế và luồng

Nguồn navigator duy nhất là auth-nav.js. Nếu HTML chưa có khung menu, runtime tạo khung. Các menu toàn cục cũ được ẩn; các nút nghiệp vụ trong trang được giữ nguyên. Tất cả màn hình dùng cùng phiên bản tệp để tránh cache lệch nhau.

Khách thấy Giới thiệu, Mua Fanpage, Tổng quan, Báo cáo, Vận hành; cuối cùng là Đăng nhập rồi Đăng ký. Người đã đăng nhập thấy nhóm Tài khoản (Tài khoản, Đơn hàng), sau cùng là Đăng xuất. Hoa hồng và Quyền lợi & Payout thuộc Vận hành. Mã giới thiệu thuộc Tài khoản khi module có route thực tế; hiện chưa tạo link giả.

Đăng xuất: gọi signOut → nếu lỗi, ở lại trang và cho thử lại → nếu thành công, xóa trạng thái xem trước quyền và chuyển tới `/analytics#login`. Không nạp lại màn hình quản lý sau đăng xuất.

## Lịch sử

Hết hiệu lực từ 2026-11-19: menu riêng theo HTML và đăng xuất bằng location.reload(). Lý do: không đồng nhất giữa giới thiệu, mua hàng và quản lý. Thay thế bằng navigator chung và chuyển về màn hình đăng nhập trong commit chứa tài liệu này. Giữ lịch sử mã nguồn ở commit 4816574 và các commit trước.

## Kiểm thử/runbook

- Kiểm tra mọi HTML tải đúng một auth-nav và không còn inline script dựng quick-nav.
- Kiểm tra cú pháp navigator, mở trang giới thiệu, mua hàng và quản lý trên 390px, 768px và desktop; kiểm tra mở/đóng menu và không tràn ngang.
- Kiểm tra phiên đăng nhập, vị trí nhóm Tài khoản/Đăng xuất; bấm Đăng xuất và xác nhận URL `/analytics#login` cùng trạng thái khách.
- Khi thêm route: phải tải cùng navigator, giữ kiểm tra quyền ở server, cập nhật route table/tài liệu và kiểm tra responsive.
