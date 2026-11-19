# Frontend và UX

## Các màn hình chính

| Route | File | Mục đích |
| --- | --- | --- |
| `/` | `index.html` | Landing/điểm vào |
| `/analytics` | `analytics.html` | Tổng quan và báo cáo |
| `/report-pages` | `report-pages.html` | Báo cáo Page |
| `/report-content` | `report-content.html` | Bài đăng và metric nội dung |
| `/report-revenue` | `report-revenue.html` | Doanh thu |
| `/payout` | `payout.html` | Hồ sơ payout và quyền tài chính |
| `/team` | `team.html` | Gán một quản lý cho nhiều nhân viên; tìm kiếm, checkbox, chọn/bỏ chọn tất cả, lọc mục đã chọn, kết thúc hàng loạt; layout card trên mobile |
| `/commissions` | `commissions.html` | Chia sẻ hoa hồng |
| `/groups` | `groups.html` | Danh mục cấp 1/cấp 2 và gán Page |
| `/users` | `users.html` | Nhân sự, role, tuyến quản lý |
| `/connect-meta` | `connect-meta.html` | OAuth Meta, cấu hình slot đồng bộ và theo dõi queue/run gần nhất; trạng thái đọc lại không dùng cache, bảng có STT |
| `/access` | `access.html` | Tài sản, BM và phân quyền |
| `/account` | `account.html` | Tài khoản và session |
| `/sales-orders` | `sales-orders.html` | Catalog, đối soát và phân công đơn Fanpage; chỉ `platform_admin`/`super_admin` |
| `/sales` | `sales.html` | Trang đặt mua Fanpage công khai theo giao diện **Fanpage Sales V3**: khung thông tin nhận Page và khung thanh toán SePay; tạo QR/mã chuyển khoản riêng, tải QR và đếm ngược 15 phút, không yêu cầu đăng nhập |

Navigator quản trị dùng hai lớp module: `Tổng quan`, `Báo cáo`, `Vận hành`, `Tài khoản`; mỗi lớp chứa các route con. `Đơn hàng` nằm trong `Vận hành`. Nguồn cấu hình là `auth-nav.js`, còn CSS chung ở `system.css`.

## Quy ước bảng dữ liệu

`auth-nav.js` áp dụng paginator dùng chung cho các bảng HTML có `tbody`: tối đa 25 dòng mỗi trang, có điều hướng trang và tổng số dòng. Bảng được tự động bổ sung cột `STT` nếu chưa có cột đánh số; STT phản ánh thứ tự bản ghi trong tập dữ liệu trước khi phân trang. Màn hình đặc biệt có thể tắt cơ chế này bằng `data-no-pagination="true"` trên bảng.

Các bảng mới phải khai báo `thead`/`tbody`, không tự tạo paginator riêng nếu không có yêu cầu đặc biệt, và phải kiểm thử cả desktop/mobile. Danh sách dạng card hoặc combobox không thuộc paginator bảng và phải có giới hạn/tìm kiếm riêng khi kích thước lớn.

`auth-nav.js` là nguồn duy nhất cho navigator. Không tự thêm menu riêng ở từng HTML. Khi thêm route, cập nhật menu, mobile menu, active state và bảng route ở tài liệu này.

## Quy ước UI

- Khu vực thao tác và khu vực dữ liệu/báo cáo phải tách rõ.
- Nhãn kỹ thuật chỉ hiện trong tooltip/help hoặc trang vận hành, không rải trong màn hình báo cáo.
- Kỳ dữ liệu luôn hiển thị cạnh bảng/biểu đồ.
- Trạng thái đồng bộ phải có nhãn màu: thành công, thất bại/cảnh báo, rỗng hoặc chưa khả dụng. Biểu tượng cảnh báo phải mở được nội dung lỗi cụ thể, không chỉ có tooltip rỗng.
- Cột cập nhật metric và cập nhật tương tác dùng `synced_at`, không dùng thời điểm dữ liệu Meta (`end_time`) để tránh hiển thị snapshot cũ như mới.
- Bảng Page chỉ hiển thị cột vận hành chính; `Tương tác`, `Metric API` và `Trạng thái kiếm tiền` nằm trong hộp chi tiết mở bằng nút `Xem thêm`. Nút `Đồng bộ danh sách đang lọc` chạy tuần tự trên toàn bộ tập kết quả sau bộ lọc, không chỉ trang hiện tại. Trạng thái `Chưa đồng bộ trong kỳ` nghĩa là chưa có snapshot thành công cho chu kỳ đang xem, không đồng nghĩa Page không có dữ liệu.
- Nút `ĐỒNG BỘ LẠI` ở đầu báo cáo cũng phải chạy tuần tự tất cả Page đang hiển thị theo chu kỳ đã chọn; không được chỉ claim một job của orchestrator rồi báo hoàn tất khi phần lớn Page chưa được đọc.
- Vùng `Bài đăng trong kỳ` luôn hiển thị chu kỳ và số bài sau bộ lọc. Khi không có kết quả, dùng empty state giải thích rõ `0 bài phù hợp bộ lọc` và hướng xử lý (đổi Page/bộ lọc hoặc đồng bộ lại đúng chu kỳ); bộ lọc bài đăng không làm thay đổi lưới hay biểu đồ doanh thu.
- Vùng bài đăng có nút `Đồng bộ bài viết trong kỳ` riêng. Nút này hiển thị tiến độ Page/bài và dùng để phân biệt việc đọc lại bài viết với đồng bộ doanh thu/metric.
- Button, input, label dùng token kích thước chung trong `system.css`.
- Chart phải có container có chiều cao tối thiểu, legend không chồng dữ liệu.
- Mobile dùng card, accordion và bottom/overlay menu; không dùng bảng cố định gây tràn ngang.

## Dữ liệu hiển thị

Frontend chỉ hiển thị snapshot/API response đã được server lọc theo access context. Không suy ra quyền từ query string hoặc `localStorage`. Bộ lọc chỉ thay đổi dữ liệu đang hiển thị, không thay đổi dữ liệu gốc.

`/sales` là tuyến mua hàng ngoài khu quản trị, được phát hành như liên kết chiến dịch/checkout công khai. Không đưa nó vào navigator nội bộ; kết quả đơn chỉ được quản trị viên xem qua `/sales-orders`.

### Điều chỉnh giao diện bán hàng 2026-11-19

- **Hiệu lực:** `/sales` dùng lại cấu trúc Fanpage Sales V3 đã được duyệt: nhận diện xanh–trắng, tiêu đề `FANPAGE SALES SYSTEM`, tab mua/đăng ký quyền lợi/Admin/FAQ, form `Thông tin nhận page` và thẻ `Thanh toán an toàn`.
- **Thay thế:** layout cam hai thẻ phát hành trước đó **hết hiệu lực ngày 2026-11-19** vì không phải bản V3 đã chốt; thay thế bằng thay đổi giao diện trong commit này. API checkout, QR, thời hạn 15 phút và quyền truy cập `/sales-orders` không thay đổi.

| Vùng tác động | Đánh giá |
| --- | --- |
| Chức năng và UI | Chỉ thay trình bày `/sales`; giữ trường checkout, QR tải về, đồng hồ 15 phút, trạng thái chờ và thông báo lỗi. |
| API và database | Không đổi `POST /api/checkout`, webhook SePay, request/response, migration hoặc dữ liệu đơn hàng. |
| Phân quyền | Không thêm role. `/sales` vẫn công khai; `/sales-orders` vẫn kiểm tra `platform_admin`/`super_admin` ở máy chủ. |
| Tích hợp | Không đổi Supabase, SePay, Vercel, cron hoặc tên miền. |
| Responsive | Kiểm thử bắt buộc tại 390px, 768px và desktop trước khi phát hành. |

Mọi route mới phải có điểm neo điều hướng trong navigator chung hoặc nút hành động từ màn hình nghiệp vụ liên quan. Route không có điểm neo được xem là chưa hoàn tất nghiệm thu.
