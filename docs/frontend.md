# Frontend và UX

## 2026-11-19 — Tổng quan chuyển hoàn toàn sang báo cáo

`/analytics` nạp `overview-reports.mjs`/model/CSS, chỉ GET content_reports. KPI/bảng theo ngày/nhân sự/Page/thiếu báo cáo, preset kỳ, empty/error/auth. Không còn runtime Meta, Chart.js hoặc Đồng bộ lại; widget báo cáo phụ không chèn lặp ở route này. Bảng chuyển thẻ <=1000px, KPI 3/2/1 cột. [Impact note và lịch sử](overview-report-source-20261119.md).

## 2026-11-19 — Lưới báo cáo và Inhouse/tài khoản

`daily-report-grid.mjs` + CSS: chọn ngày, ba chỉ số USD, payout và lưu các dòng thay đổi; Page tuyến dưới hiện người báo cáo và chỉ đọc. Tổng hợp/widget dùng currency riêng. Inhouse dùng `inventory-inhouse-screen.mjs`, bộ lọc và `inventory-assignment.mjs`: tìm người, Page ID/link/copy, Profile Facebook và sửa tên nội bộ. Script `inventory-inhouse.js` cũ **Hết hiệu lực** ngày 2026-11-19 cho route này, thay bằng module mới; không còn được HTML nạp. Tài khoản có phone/Facebook, số Page/phân công/payout lấy kho hiện hành. Checkout lấy link hồ sơ đã lưu. [Luồng báo cáo](daily-report-matrix-20261119.md) · [Luồng tài khoản/giao người](inventory-assignment-profile-20261119.md).

## 2026-11-19 — Import và nhân sự cùng bảng

`inventory-import.mjs` mở từ nút trong Nhập kho, đọc CSV/TSV/dán bảng, kiểm tra/xem trước trước khi POST. Renderer chung kho tổng/Inhouse thêm Người đang quản lý, hiển thị nhiều phân công active cùng dòng. Vùng nhân sự riêng trên Inhouse hết hiệu lực, thay bằng cột này; không xóa phân công. [Luồng và responsive QA](inventory-bulk-and-inline-assignees-20261119.md).

## 2026-11-19 — Bốn trường Page trên danh sách kho

Kho tổng và Inhouse dùng chung `inventory-business.js`: ID Page, Link, Tên hiện tại, Tài khoản cầm, trạng thái, giá nhập, thao tác. Link Facebook HTTPS được escape và mở tab mới an toàn. Thông tin hệ thống/BM nằm trong Chi tiết. Màn hình <=1000px dùng thẻ để đọc đầy đủ; desktop dùng bảng. [Nghiệm thu](inhouse-page-import-20261119.md).

Theo yêu cầu mới, quy tắc hiển thị mọi cột kho/đơn **Hết hiệu lực** từ đợt [vận hành Inhouse và bán hàng](operations-inhouse-reports-20261119.md): kho 6 cột, đơn 7 cột và Chi tiết khi cần; mobile card. `/access` chỉ Page Inhouse, `/daily-reports` nộp báo cáo, bốn trang tổng quan/báo cáo có số liệu vận hành. Cấu hình chiết khấu cùng giá, mã giới thiệu/quà tách mã ưu đãi, hỗ trợ/Zalo; menu mobile giới hạn theo viewport và tự cuộn, không bị cắt trên màn hình thấp.

Gate 2.2 bổ sung `/inventory-inhouse` trong Vận hành, panel **Kho & bàn giao** trong đơn, lịch sử từng mã trong kho. Native dialog có đóng, thông báo kết quả và khoá nút khi gửi. API trả scope để hiển thị thao tác; không thay kiểm tra quyền server. Bảng giữ mọi trường và cuộn ngang trong khung. Xem [luồng và nghiệm thu](inventory-fulfillment-release-20261119.md).

Nâng cấp giá theo hiệu lực, bảng đầy đủ cột, tên Page và cơ chế menu: [kế hoạch độc lập, thiết kế và nghiệm thu](parallel-upgrade-20261119.md). Riêng đơn hàng/kho giữ tất cả cột và scroll ngang trong khung, thay quy tắc ẩn cột/card trước đây theo yêu cầu ngày 2026-11-19.

Quyền xem đơn và luồng báo giá/QR/theo dõi thanh toán: [ma trận quyền, impact note và kết quả QA](order-access-and-checkout-qa-20261119.md). Quy ước chỉ admin xem đơn **hết hiệu lực 2026-11-19**, thay bằng đơn của mình/phân công hoặc quyền read_all; action quản trị vẫn kiểm tra riêng ở server.

Sửa banner /sales và bổ sung lịch giá admin: [thiết kế, impact note và kiểm thử](sales-banner-and-price-schedule-20261119.md).

Quy ước navigator toàn bộ trang giới thiệu, mua hàng và quản lý: [Đồng bộ navigator 2026-11-19](navigation-unification-20261119.md). Đăng xuất thành công chuyển đến `/analytics#login`. Mọi HTML dùng cùng `auth-nav.js?v=20261119-all-menu`.

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
| `/signup` | `signup.html` | Đăng ký/đăng nhập Google, chuyển về Tài khoản sau khi có phiên |
| `/sales-orders` | `sales-orders.html` | Catalog, đối soát và phân công đơn Fanpage; chỉ `platform_admin`/`super_admin` |
| `/inventory-fanpages` | `inventory-fanpages.html` | Kho Fanpage: xem mã kho theo quyền `sales_inventory.read`; nhập mã nháp khi có `intake`; mở bán mã nháp khi có `publish` |
| `/sales` | `sales.html` | Trang đặt mua Fanpage công khai theo giao diện **Fanpage Sales V3**: khung thông tin nhận Page và khung thanh toán SePay; tạo QR/mã chuyển khoản riêng, tải QR và đếm ngược 15 phút, không yêu cầu đăng nhập |

Navigator dùng các nhóm `Tổng quan`, `Báo cáo`, `Vận hành` và (chỉ sau đăng nhập) `Tài khoản`. `Hoa hồng` và `Quyền lợi & Payout` nằm trong `Vận hành`; `Đơn hàng` nằm trong `Tài khoản`. Cuối menu là **Đăng nhập → Đăng ký** khi chưa có phiên, hoặc **Tài khoản → Đăng xuất** khi đã đăng nhập. Nguồn cấu hình là `auth-nav.js`, còn CSS chung ở `system.css`.

## Target IA: Sales Platform

Thiết kế menu/screen cho catalog, kho Fanpage/kho Inhouse, đơn hàng, bàn giao, báo cáo theo nhân sự/Page và cấu hình được quy định tại [sales-platform-design.md](sales-platform-design.md). `/inventory-fanpages` là menu production Gate 2; catalog, kho Inhouse, bàn giao và báo cáo theo nhân sự/Page vẫn là `Roadmap`. Khi triển khai, cập nhật đồng thời `auth-nav.js`, mobile overlay, route table này và module map; không tạo menu riêng trong từng màn hình sales.

Mã giới thiệu thuộc phạm vi **Tài khoản**, không phải Vận hành. Chưa có route hiển thị/gán mã giới thiệu cho CTV nên chưa được đặt liên kết trong menu production; tránh đưa người dùng tới màn hình rỗng. Module này được triển khai cùng scope `affiliate` và attribution đơn hàng.

## Quy ước bảng dữ liệu

`auth-nav.js` áp dụng paginator dùng chung cho các bảng HTML có `tbody`: tối đa 25 dòng mỗi trang, có điều hướng trang và tổng số dòng. Bảng được tự động bổ sung cột `STT` nếu chưa có cột đánh số; STT phản ánh thứ tự bản ghi trong tập dữ liệu trước khi phân trang. Màn hình đặc biệt có thể tắt cơ chế này bằng `data-no-pagination="true"` trên bảng.

Các bảng mới phải khai báo `thead`/`tbody`, không tự tạo paginator riêng nếu không có yêu cầu đặc biệt, và phải kiểm thử cả desktop/mobile. Danh sách dạng card hoặc combobox không thuộc paginator bảng và phải có giới hạn/tìm kiếm riêng khi kích thước lớn.

`auth-nav.js` là nguồn duy nhất cho navigator. Không tự thêm menu riêng ở từng HTML. Khi thêm route, cập nhật menu, mobile menu, active state và bảng route ở tài liệu này.

### Đồng bộ menu con — 2026-11-19

- **Trạng thái:** `Đang dùng`.
- `/account` đã bỏ navigator cục bộ và khởi tạo bằng `auth-nav.js`, cùng nguồn với các màn hình con khác.
- Menu theo phiên: khách thấy **Đăng nhập → Đăng ký**; người đã đăng nhập thấy nhóm **Tài khoản** (Tài khoản, Đơn hàng) và **Đăng xuất** ở cuối. Các mục Báo cáo/Vận hành giữ thứ tự như nhau trên mọi route.
- **Impact note:** tác động UI/navigator và cache tệp tĩnh ở `/account`; không đổi API, database, RLS, role, cron, SePay, Supabase hoặc DNS. Kiểm thử `/account` ở 390px, 768px, desktop và xác nhận menu không che nội dung.

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

Quy ước **Hết hiệu lực từ 2026-11-19**: `/sales` chỉ là liên kết chiến dịch ngoài navigator. Thay thế: `/sales` vẫn là checkout công khai, nhưng có điểm neo **Mua Fanpage** trong navigator chung để người dùng chuyển được giữa giới thiệu, mua và quản lý. Kết quả đơn vẫn chỉ được quản trị viên xem qua `/sales-orders` cho đến khi có màn hình đơn hàng cá nhân.

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

## Bổ sung ngày 2026-11-19 — báo cáo trước, payout sau

Đang dùng trong bản sửa cùng migration `20261119234000_allow_reporting_pending_payout.sql`: nhân sự trực tiếp được nhập/lưu báo cáo USD khi chưa có payout phù hợp. UI cảnh báo cần bổ sung; API trả `payout_pending=true` và giữ snapshot NULL. Khi sửa báo cáo chưa có snapshot, chỉ gắn payout hiện hành active cùng currency. Snapshot đã có và báo cáo đã duyệt không tự đổi. Quy tắc bắt buộc payout trước nộp báo cáo tại migration `20261119232000` Hết hiệu lực ngày 2026-11-19; giữ mô tả cũ để tra lịch sử. Không đổi RBAC, RLS, domain hay cron. Xem [impact note](report-entry-pending-payout-20261119.md).

Cấp/đổi payout trực tiếp tại dòng Page kho Inhouse qua dialog dùng chung; GET/POST inhouse_assets giữ quyền manage_payout và scope Page server-side. Xem [impact note](inhouse-inline-payout-20261119.md).

Bản nối tiếp: [quy trình duyệt thủ công, giới hạn xác minh và thao tác kho gọn](report-verification-and-compact-actions-20261119.md). Người có quyền đối chiếu bằng chứng, không tự duyệt; verified chưa phải duyệt chi. Tổng hợp bao gồm ngày vừa lưu; icon desktop 28px, vùng chạm coarse 44px, payout không bẻ chữ.

2026-11-19: [Menu thao tác kho gọn](inventory-action-menu-20261119.md) thay cụm nút phụ luôn hiển thị bằng popover ⋯. Giữ nút chính, quyền/action server-side không đổi; 47 Node tests pass.
