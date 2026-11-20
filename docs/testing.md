# Kiểm thử và nghiệm thu

Tổng quan 2026-11-19: `overview-reports.test.mjs` kiểm tra nguồn report thay metrics cũ, hai người cùng Page, rejected không cộng, currency riêng, luỹ kế mới nhất, kỳ qua tháng/năm và route không nạp sync/runtime Meta. Quyền API được phủ bởi page-scope-api.test.mjs; CSS 390/768/desktop dùng card/table và KPI 1/2/3 cột. [Biên bản](overview-report-source-20261119.md).

## 2026-11-19 — Bản báo cáo USD và tài khoản/phạm vi Page

Production: 8 URL trang/module đúng bản mới trả 200, API hồ sơ không phiên trả 401; hai migration đã có history. Kiểm tra server handler với dữ liệu production (chỉ mock Auth user lookup, không ghi dữ liệu giả) xác nhận account source `inhouse_current`, 149 Page/149 phân công/149 trực tiếp, fields phone/Facebook và 149 assignment báo cáo của chính người đó. Bộ tự thêm STT/phân trang chung không áp dụng cho lưới có ô nhập.

40 test Node pass. SQL rollback: 15 checks currency/payout + 17 hồi quy vận hành + 12 hồ sơ/phạm vi/account = 44 pass. Kiểm tra ownership, khóa verified, retry, tiền không hữu hạn, payout history/snapshot, admin-all/manager-branch/staff-direct và account loại Page cũ. CUA đã xem lưới USD ở 390/768/1280px, modal payout, tìm Inhouse không dấu 1/4 và bộ lọc/mobile. CUA kiểm tra tiếp modal giao người bị công cụ dừng do không xác định URL đủ chắc chắn; không coi phần đó đã nghiệm thu trực tiếp. Các tương tác tìm/copy/rename/contacts có unit/SQL và sẽ đối chiếu API khi phát hành. [Phạm vi nghiệm thu](inventory-assignment-profile-20261119.md).

## 2026-11-19 — Nhập hàng loạt / nhiều người cầm

`inventory-import.test.mjs`, `sales-grid.test.mjs`, `sales-inventory-service.test.mjs`: parser, ID dài/ID trùng/CSV quoted/giá, nhiều phân công active cùng dòng, API intake scope và actor chống giả mạo. `supabase/tests/inventory_intake_batch_rollback.sql` 8 checks pass trong rollback. CUA renderer 390/768/1280 và xem trước TSV mẫu pass. [Biên bản](inventory-bulk-and-inline-assignees-20261119.md).

## 2026-11-19 — Import Inhouse

Dry-run 149 Page rollback; kiểm tra 148 mới/1 tái sử dụng, giữ giá vốn, từng tên/link/tài khoản cầm, manager/page access, người mua/phụ trách, 2 đơn zero verified, import lặp, hash sai, actor thiếu quyền, ID trùng và rollback lỗi dòng cuối. Kiểm tra client không EXECUTE RPC và bảng batch bật RLS. `sales-grid.test.mjs` bổ sung 4 trường và link không an toàn. [Chi tiết nghiệm thu](inhouse-page-import-20261119.md).

Đợt mới: `node --test` và các SQL rollback `inventory_fulfillment_rollback.sql` (21), `operations_reports_rollback.sql` (17), `order_debt_warranty_rollback.sql` (15) đã đạt. Bộ đầu đã đổi case thiếu kho thành nhận đơn nợ theo yêu cầu mới. API thật qua máy chủ QA + Supabase đạt 24 bước, dữ liệu tách riêng và dọn sau test. UI kiểm tra 390×844, 768×1024, 1440×960 và menu màn hình thấp 390×450. [Chi tiết nghiệm thu](operations-inhouse-reports-20261119.md).

Gate 2.2: `node --test` đạt 12 kiểm tra. `supabase/tests/inventory_fulfillment_rollback.sql` chạy BEGIN/ROLLBACK trên dữ liệu QA riêng đạt 21 kiểm tra; hai phiên DB kiểm tra nhập cùng ID và checkout cùng mã đạt, QA đã dọn. Kết quả, phạm vi và giới hạn tại [nghiệm thu kho](inventory-fulfillment-release-20261119.md). Quy tắc mobile bảng chuyển card bên dưới **Hết hiệu lực riêng với bảng đơn/kho**: theo yêu cầu mới, giữ đủ cột và cuộn ngang trong khung. Quy tắc sales-orders chỉ admin bên dưới **Hết hiệu lực**: owner/assignee đọc đơn phạm vi, read_all/admin đọc toàn bộ; ghi kho còn yêu cầu scope và phạm vi đơn.

## Kiểm tra cú pháp

Project là frontend HTML/JS và Vercel Functions, không có test runner bắt buộc. Chạy tối thiểu:

```powershell
Get-ChildItem api -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --check analytics-runtime.js
node --check auth-nav.js
node --check report-sections.js
```

## Kiểm tra cấu trúc tài liệu/liên kết

```powershell
rg -n '\]\(([^)#]+)\)' README.md CONTRIBUTING.md docs
```

Mọi liên kết nội bộ phải tồn tại; không link tới `.env`, token, URL preview hoặc file dữ liệu cá nhân.

## Smoke test API

1. Đăng nhập Google trên production.
2. Mở `/api/auth/profile` bằng session hiện tại.
3. Mở báo cáo và xác nhận không có request Graph từ browser.
4. Chạy sync một Page, sau đó kiểm tra `sync_runs`, `pages`, `posts`, `metrics`.
5. Tạo một lỗi quyền giả lập hoặc Page không có token và xác nhận các Page khác vẫn hoàn thành.
6. Kiểm tra `401`, `403`, `400` bằng request thiếu/không hợp lệ.
7. Với line bán hàng: platform admin mở `/sales-orders`, phân công một đơn rồi kiểm tra `admin_audit_logs`; thử một account không phải admin nhận `403` từ `/api/admin/sales-orders`.
8. Với SePay Test Mode: tạo đơn tại `/sales` bằng mã `INHOUSE` (kỳ vọng 10.000 đ), dùng nội dung chuyển khoản chính xác `FSXXXXXXXXXX`; chỉ chuyển `paid` khi webhook đúng token, đúng mã và đúng số tiền; gửi lại cùng event để xác nhận không tạo thanh toán trùng. Không dùng giao dịch tiền thật trong bài test này.
9. Với checkout: kiểm tra nút tải QR trả tệp PNG chỉ cho mã `FS` hợp lệ; đồng hồ đếm từ 15:00 dựa trên `payment_expires_at`. Webhook đến sau hạn không được tự chuyển đơn sang `paid` mà ghi event `expired` và chuyển đơn sang cần đối soát.

### Nghiệm thu 2026-11-19

- **Đạt:** webhook Test Mode → Production trả HTTP 200.
- **Đạt:** tạo đơn public `FS8BD4948AE3` với `INHOUSE`, số tiền QR 10.000 đ.
- **Đạt:** mô phỏng tiền vào 10.000 đ với nội dung đúng mã; SePay xác nhận và trang `/sales-orders` ghi `paid`.
- **Chưa chạy:** kiểm tra gửi lại cùng `provider_event_id` ở giao diện Test Mode. Code đã có khóa unique/idempotency; cần chạy lại khi cần chứng minh thao tác vận hành này.
- **Đạt (Live):** SePay webhook #73924 tới `https://money.aiecom.vn/api/payments/sepay` trả `HTTP 200` qua callback thử sau khi đồng bộ Production Secret và redeploy `dpl_86RZRcYnzfrvLERJh1EmTbtMkGd4`.
- **Chưa chạy (Live):** giao dịch tiền thật đầu tiên. Không thực hiện tự động; khi có giao dịch do khách hàng tạo, xác nhận mã đơn, số tiền, trạng thái `paid` và event idempotency trong `/sales-orders`.
- **UI V3:** kiểm tra `/sales` phải giữ bố cục Fanpage Sales V3 ở desktop, 768px và 390px: tab không che nội dung, hai thẻ chuyển về một cột trên mobile, nhãn/nút không tràn và QR vẫn tải được sau khi tạo đơn.

## Ma trận quyền tối thiểu

## Sales Platform test gate (Roadmap)

- Hai request reserve cùng một mã Page: chỉ một request thành công.
- Huỷ/hết hạn đơn trả mã Page về đúng kho tổng; transfer Inhouse không tạo lại tồn kho tổng.
- User không được chỉ định không xác minh được đơn 0đ hoặc xem Page/kho ngoài scope.
- Hai assignment cùng Page có báo cáo và hoa hồng riêng; tổng Page đúng, tổng nhân sự không lẫn nhau.
- Manager nhìn thấy direct/inherited theo access context nhưng quyền lợi chưa duyệt không bị cộng vào payout.
- Google Sheet connector chỉ gọi read API; kiểm thử không có request ghi/update.
- Kiểm thử 390px, 768px, desktop cho kho, đơn, dashboard và menu overlay.

### Gate 1 — migration và transaction kho

Trước khi chuyển Gate 1 sang `Đang dùng`, chạy trong dữ liệu fixture cô lập:

1. Tạo item Fanpage `available`; gọi reserve song song bằng hai mã đơn khác nhau. Chỉ một lời gọi thành công và ledger có một dòng `reserved`.
2. Gọi release/finalize với mã đơn không trùng mã reserve. Transaction bị từ chối, trạng thái và ledger không đổi.
3. Finalize `external_sold`. Item không reserve lại được.
4. Finalize `inhouse_transferred` với Page registry hợp lệ. Có đúng một item kho Inhouse và Page không về kho tổng.
5. Dùng JWT `authenticated` không phải service role để đọc/ghi bảng Gate 1 hoặc gọi RPC. Tất cả bị từ chối.
6. Hai `page_assignments` chung Page nộp báo cáo cùng ngày. Kết quả tách biệt; trùng assignment/ngày bị từ chối.

| Vai trò | Đọc Page | Đọc nội dung | Đọc doanh thu | Đọc payout | Sync Page | Quản lý user |
| --- | --- | --- | --- | --- | --- | --- |
| viewer | được gán | được gán | không mặc định | không mặc định | không | không |
| analyst | được gán | được gán | được gán | theo cấp | không | không |
| operator | được gán | được gán | được gán | theo cấp | Page được gán | không |
| manager | tuyến dưới | tuyến dưới | tuyến dưới | theo access | Page tuyến dưới | hạn chế |
| platform_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |
| super_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |

`/api/admin/sales-orders` và `/sales-orders` chỉ dành cho `platform_admin`/`super_admin`; người phụ trách đơn không có quyền tự xem dữ liệu checkout qua API này. Checkout public sẽ có endpoint riêng sau khi được bật có kiểm soát.

## Responsive QA

### Route đăng nhập — 2026-11-20

- Kiểm tra `GET /login` trả trang Analytics thay vì `404 NOT_FOUND`.
- Kiểm tra nút đăng nhập khi chưa có phiên dùng `/analytics#login`.

Kiểm tra ít nhất 390px, 768px và desktop:

- menu mở được và nổi trên nội dung (`z-index` đúng);
- không có overlap header, label, chart hoặc button;
- bảng lớn chuyển thành card/list trên mobile, không ép cuộn ngang;
- bộ chọn nhiều có search, chọn tất cả, bỏ chọn tất cả, bộ đếm và lọc đang chọn;
- mọi màn hình có navigator thống nhất.

## Tiêu chí không đạt

- Có lỗi console chưa giải thích.
- Dữ liệu kỳ này hiển thị chung với kỳ khác.
- Dữ liệu rỗng bị trình bày như request thành công.
- Người không có payout access thấy số tiền.
- Token/secret xuất hiện trong HTML, response hoặc log.

## Bổ sung ngày 2026-11-19 — báo cáo trước, payout sau

Đang dùng trong bản sửa cùng migration `20261119234000_allow_reporting_pending_payout.sql`: nhân sự trực tiếp được nhập/lưu báo cáo USD khi chưa có payout phù hợp. UI cảnh báo cần bổ sung; API trả `payout_pending=true` và giữ snapshot NULL. Khi sửa báo cáo chưa có snapshot, chỉ gắn payout hiện hành active cùng currency. Snapshot đã có và báo cáo đã duyệt không tự đổi. Quy tắc bắt buộc payout trước nộp báo cáo tại migration `20261119232000` Hết hiệu lực ngày 2026-11-19; giữ mô tả cũ để tra lịch sử. Không đổi RBAC, RLS, domain hay cron. Xem [impact note](report-entry-pending-payout-20261119.md).

Cấp/đổi payout trực tiếp tại dòng Page kho Inhouse qua dialog dùng chung; GET/POST inhouse_assets giữ quyền manage_payout và scope Page server-side. Xem [impact note](inhouse-inline-payout-20261119.md).

Bản nối tiếp: [quy trình duyệt thủ công, giới hạn xác minh và thao tác kho gọn](report-verification-and-compact-actions-20261119.md). Người có quyền đối chiếu bằng chứng, không tự duyệt; verified chưa phải duyệt chi. Tổng hợp bao gồm ngày vừa lưu; icon desktop 28px, vùng chạm coarse 44px, payout không bẻ chữ.

2026-11-19: [Menu thao tác kho gọn](inventory-action-menu-20261119.md) thay cụm nút phụ luôn hiển thị bằng popover ⋯. Giữ nút chính, quyền/action server-side không đổi; 47 Node tests pass.

2026-11-19: [Hai kho tài nguyên và menu ghim](page-resource-warehouses-20261119.md). Nguồn ảnh/video theo Page; grants theo assignment, quyền assign_inhouse hiện có + scope; Google riêng tư yêu cầu quyền/duyệt email theo tài khoản cá nhân, không service account hay tự đổi chia sẻ. Migration 20261119235000, API page_resources và assign_resources, menu fixed có spacer. 51 Node/59 SQL checks pass; file Google thật chờ URL do quản lý thiết lập.

[Điểm tạm dừng và đối chiếu kế hoạch](project-status-and-next-gate-20261119.md): /access → Tài khoản / Tài sản được giao; giữ route và auth/RBAC/data-scope hiện có. Không migration, không đổi env/domain/cron; yêu cầu bàn giao theo đầu vào đơn chỉ ghi kế hoạch, chưa triển khai. Phân biệt không có quyền vào (401/403) với được vào nhưng dữ liệu trong phạm vi/đang trống.
