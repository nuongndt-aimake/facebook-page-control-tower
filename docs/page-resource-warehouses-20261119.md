# Kho tài nguyên ảnh/video và menu ghim — 2026-11-19

Trạng thái: Đang dùng trong bản nâng cấp đã kiểm thử. Thiết kế dưới đây thay bản nháp cùng ngày theo xác nhận mới của người dùng.

## Thiết kế đã chốt

- Mỗi Page Inhouse có hai file Google Sheet riêng: image và video. Cửa sổ Kho tài nguyên cho mở Sheet gốc hoặc nạp bảng xem Google bằng iframe preview, không đọc qua tài khoản chung, không copy dữ liệu Sheet vào DB và không ghi ngược. Tab gid được giữ nguyên.
- Nhân sự/CTV lần đầu mở Sheet riêng tư dùng tài khoản Google đang sử dụng để gửi yêu cầu truy cập. Quản lý **file Google** phải là chủ file/người có quyền chia sẻ; Google gửi email và quản lý cấp Viewer theo cơ chế Google. Vai trò manager trên ứng dụng không tự trở thành chủ file Google. Hệ thống nhắc email đăng nhập ứng dụng; do khác miền, không tự kiểm tra/ép tài khoản Google đang mở hay biết yêu cầu đã được Google duyệt. Nếu nhúng bị chặn đăng nhập/cookie, dùng Mở Sheet / Yêu cầu truy cập. Không yêu cầu public file.
- Nguồn gắn Page, quyền loại kho gắn assignment. Lúc Giao nhân sự chọn ảnh/video/cả hai/không kho. Có thể đổi lựa chọn của từng phân công tại Thiết lập. Cũ không được tự mở quyền kho; giữ phân công Page/báo cáo cũ. Assignment và grants lưu transaction chung, lỗi audit rollback tất cả. Thu hồi ứng dụng không tự thu hồi quyền Google đã được cấp; quản lý file cần thu hồi bên Google khi bàn giao nhân sự.
- Ma trận role × chức năng: admin có toàn bộ quyền; người được cấp sales_inventory.assign_inhouse và đang có phạm vi Page được cấu hình/giao hai kho; người khác chỉ đọc loại kho có grant trên assignment trực tiếp active. Manager không được dùng quyền giao để vượt phạm vi Page. Không thêm role/quyền độc lập. GET không trả URL loại kho bị chặn; service-only RPC + RLS bảo vệ DB.
- Kho Inhouse: ⋯ → Thiết lập kho tài nguyên/Kho tài nguyên. Nhân viên/CTV không có quyền đọc kho bán hàng dùng Vận hành → Tài sản → Kho tài nguyên; không cần cấp thêm quyền kho hàng để xem tài nguyên được giao. Dialog Giao nhân sự đồng bộ ở cả hai màn hình.
- Menu chung fixed ở đỉnh khi cuộn, spacer cập nhật theo ResizeObserver tránh che nội dung; menu con vẫn mở theo cơ chế chung. Giữ lịch sử sticky cũ Hết hiệu lực 2026-11-19 do ancestor overflow có thể cuốn mất menu.

## Impact/API/database/deployment

- `GET /api/admin/access?endpoint=page_resources[&page_id=...]` trả danh sách Page có quyền hoặc nguồn/allowed_kinds; người có quyền giao nhận thêm assignments. `POST` action configure/grant. Actor lấy accessContext, preview chặn mutation. `sales_inhouse` POST assign_resources gọi cùng RPC action assign; không nhận actor do browser đưa.
- Migration 20261119235000_page_resource_warehouses (tạo CLI 20261119162344) thêm page_resource_sources(PK page_id/kind), page_resource_grants(PK assignment_id/kind), helper/RPC/audit. RLS và ACL service-only; URL canonical HTTPS docs.google.com duy nhất. Không backfill grants.
- Không credential Google/API key mới; không thay env, cron, domain, Meta, SePay, số liệu báo cáo. Không gửi email qua ứng dụng; Google tự xử lý yêu cầu người dùng gửi trong Google. Chỉ định app không thay sharing file.
- 51 Node tests pass, 59 SQL checks pass trong rollback (15 currency/payout + 17 operations + 12 profile/scope + 15 resources). Chưa có hai URL Sheet thật do người dùng nhập; việc yêu cầu quyền/duyệt email Google trên file thật không được mô phỏng là đã thành công. Kiểm tra responsive và phiên bản deploy ghi ở cuối.

## Runbook

Quản lý mở Page → ⋯ → Thiết lập kho tài nguyên → dán hai liên kết Sheet, đúng gid nếu cần → Lưu hai kho. Giao nhân sự và chọn loại kho, hoặc chỉnh từng phân công tại cùng dialog. CTV mở Tài sản/Kho tài nguyên, kiểm tra email được nhắc, mở Sheet để gửi yêu cầu quyền lần đầu; quản lý file phê duyệt Viewer trên email Google. Quay lại dùng Nạp bảng tại đây hoặc Mở Sheet. Không đổi file thành public để xử lý lỗi quyền.

Nguồn: [Google: yêu cầu và nhận quyền truy cập](https://support.google.com/drive/answer/16722399?hl=en), [Google: quản lý chia sẻ file](https://support.google.com/drive/answer/7166529?hl=en), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Hết hiệu lực — bản nháp trước xác nhận cơ chế Google

Các mô tả service account, credentials server và bảng parse 1.001×26 trong bản nháp dưới đây Hết hiệu lực ngày 2026-11-19, **chưa triển khai**. Thay bằng Google preview/quyền tài khoản cá nhân theo thiết kế trên. Giữ nguyên bản nháp để tra lịch sử:
# Hai kho tài nguyên Google Sheet trên Page Inhouse — 2026-11-19

Trạng thái: Đang triển khai. Người dùng chọn Sheet riêng tư, không đổi chia sẻ sang công khai.

## Impact note / thiết kế

- Mỗi Page có hai cấu hình nguồn image/video riêng biệt, mỗi nguồn một Google Sheet + tab gid. Không lưu nội dung Sheet lâu dài và không ghi ngược. Đọc có giới hạn 1.001 dòng × 26 cột, hiển thị bảng, bộ lọc và liên kết HTTPS an toàn. Không chạy công thức hay nhúng HTML từ Sheet.
- Quyền kho gắn vào phân công Page. Khi giao nhân sự chọn ảnh/video/cả hai/không giao kho; mặc định không mở quyền dữ liệu cũ. Giao Page và quyền kho mới nằm trong cùng transaction. Có thể điều chỉnh quyền kho của phân công đang hoạt động tại cửa sổ thiết lập. Kết thúc phân công mất quyền ngay, không cấp quyền Google Drive tự động.
- Ma trận: admin tất cả; người có `sales_inventory.assign_inhouse` cấu hình/giao kho chỉ trong phạm vi Page hiện hành; nhân viên/CTV chỉ xem loại kho được giao trực tiếp; người không quyền không nhận URL hay dữ liệu. Không thêm role/scope mới. Server RPC invoker và RLS, browser không đọc trực tiếp bảng hay gọi RPC.
- UI: nút Tài nguyên trên dòng Inhouse mở hai kho trong dialog; người có quyền thấy Thiết lập và phân công nguồn. Dialog giao nhân sự có lựa chọn kho. Giữ menu ⋯ gọn. Không tạo route rời/menu không có điểm vào.
- Tài khoản Google đọc riêng tư: `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` chỉ server; scope spreadsheets.readonly, không domain delegation. Chủ file chia sẻ Viewer cho email dịch vụ. Không có credential thì vẫn lưu nguồn/giao quyền/mở liên kết Google; nạp bảng báo rõ chưa kết nối. Chưa tìm thấy credential hiện hành; kết nối và chia sẻ hai file thật là phụ thuộc còn thiếu, không bịa trạng thái nạp thành công.
- Ghim menu: quick-nav fixed ở đỉnh, spacer theo ResizeObserver tránh che nội dung; menu con nổi trên bảng, 390/768/desktop. Thay sticky cũ bị ảnh hưởng bởi ancestor overflow; giữ lịch sử cũ Hết hiệu lực 2026-11-19.
- Tác động API admin/access page_resources, inventory assign_resources; DB bảng nguồn/quyền + RPC/audit; account/overview/report không đổi số liệu, cron/domain/Meta/SePay không đổi. Tài liệu API/database/security/frontend/env/deployment/testing/runbook cập nhật cùng commit.

## Kiểm thử / triển khai

Kiểm tra admin, người giao trong/ngoài phạm vi, nhân sự ảnh không xem video, user khác/assignment ended, rollback phân công nếu quyền lỗi; URL không phải Google bị từ chối; XSS/hyperlink/giới hạn đọc; đọc Sheet không write, không redirect/SSRF. Áp dụng migration sau rollback QA; preview rồi production. Ghi kết quả thực tế ở cuối tài liệu.

Nguồn kỹ thuật: [Sheets spreadsheets.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [service account](https://developers.google.com/identity/protocols/oauth2/service-account), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Kết quả kiểm tra trước phát hành

Computer Use: renderer/dialog thực tế với fixture chỉ ở máy, viewport iframe 390/768/1280; menu vẫn ở đỉnh sau cuộn xuống cuối, menu điện thoại mở được tại cuối trang; thiết lập hai URL mẫu và lưu hiện đúng hai liên kết, form giao loại kho không overlap. Google private iframe/email approval thực tế chưa kiểm thử vì chưa có URL hai file thật; không gửi yêu cầu/email hay thay sharing trong QA. Migration và dữ liệu thử được rollback khi kiểm thử. Không suy diễn fixture thành kết nối Google thật.

Migration 20261119235000 đã áp dụng Supabase. Kiểm tra sau migration: 11 trường hợp API handler + RPC production pass trong transaction rollback, không giữ dữ liệu thử. Nguồn/quyền mới chưa tự gắn lên Page thật; quản lý nhập hai URL tại Thiết lập. 51 Node tests pass; 59 SQL checks pass. Vercel phát hành qua Git trong dự án AIMAKE facebook-page-control-tower, canonical money.aiecom.vn; không cấu hình domain mới.
