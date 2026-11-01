# Triển khai vận hành Page: bán chia doanh thu và bán đứt

## Nguyên tắc vận hành

- Mỗi Page có một **BM lưu ký** và một trạng thái quản lý; không lưu Facebook/Page token trong database.
- Tách giao dịch `revenue_share` khỏi `outright_sale`. Một Page chỉ nên có một giao dịch đang hoạt động.
- Không cấp Full Control dựa trên đơn đăng ký. Mọi quyền phải qua trạng thái chấp thuận và audit log.
- Bán đứt chỉ hoàn thành sau khi chủ hệ thống xác nhận đã release Page khỏi BM và đã gỡ toàn bộ quyền nội bộ.

## Những phần đã có trong MVP

- [schema Supabase](supabase/schema.sql): inventory Page, deals, người đăng ký, dòng doanh thu và audit log.
- `POST /api/public/application`: nhận đơn đăng ký khách/đối tác.
- `GET|POST /api/admin/deals`: tạo và xem giao dịch (bảo vệ bằng `DASHBOARD_ADMIN_KEY`).
- `POST /api/admin/handover`: chuyển trạng thái đã kiểm soát. Bán đứt buộc xác nhận chuỗi `RELEASED_AND_REMOVED`.
- `POST /api/admin/send-bm-invite`: gửi lời mời Business User sau khi duyệt; chỉ chạy khi đặt `ENABLE_META_BM_INVITES=true`.
- API/cron Meta có sẵn từ bản trước để lấy nội dung và insights hằng ngày.
- `register.html?deal=<DEAL_UUID>`: form công khai để gửi riêng cho khách/đối tác của một giao dịch.

## Việc bạn cần làm trước khi deploy

1. Tạo Supabase project, chạy lại toàn bộ `supabase/schema.sql` trong SQL Editor.
2. Tạo Vercel project từ repository, thêm các biến môi trường trong `README_VERCEL_SUPABASE.md`.
3. Với mỗi BM, xác định Business ID và tài khoản Facebook đang có Page task `ANALYZE` trở lên.
4. Tạo token Meta long-lived và cấu hình `META_CONNECTIONS_JSON`; không chia sẻ token.
5. Điền `custodian_business_id` cho mỗi Page do BM giữ (bằng Supabase Table Editor hoặc SQL), hoặc khai `business_ids` trong đúng Meta connection.
6. Trong Meta App, xin quyền chính xác cho phần bạn dùng. Chỉ bật `ENABLE_META_BM_INVITES=true` sau khi Meta duyệt `business_management` và bạn thử lời mời ở một BM test.

## Quy trình cho giao dịch chia doanh thu

1. Chọn Page `ready`, tạo deal `revenue_share` cùng tỷ lệ chia.
2. Khách/đối tác gửi đơn đăng ký.
3. Bạn duyệt, mời họ vào BM, chờ họ chấp nhận; cấp task nhỏ nhất cần thiết.
4. Đồng bộ insight hằng ngày. Nhập doanh thu đã đối soát từ Business Suite vào `revenue_entries`.
5. Tính phần chia theo deal, ghi nhận thanh toán và giữ Page trong BM.

## Quy trình cho bán đứt

1. Tạo deal `outright_sale`; xác minh thanh toán, danh tính và email nhận quyền ngoài hệ thống.
2. Mời khách, chờ họ chấp nhận và xác nhận khách có Full Control.
3. Dừng toàn bộ vận hành nội bộ, xuất biên bản/số liệu chốt cuối.
4. Trong Meta Business Settings, release Page khỏi BM nếu phù hợp và gỡ tất cả quyền nội bộ.
5. Kiểm tra bằng giao diện Meta. Chỉ sau đó gọi `complete_outright_handover` với xác nhận bắt buộc.

Meta mô tả Full Control cho phép người nhận thêm/xóa quyền và xóa Page; vì vậy bước 4 không tự động hóa. Xem [Page access](https://www.facebook.com/help/289207354498410/r.php/).
