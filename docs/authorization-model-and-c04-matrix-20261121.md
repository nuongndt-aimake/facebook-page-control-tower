# Mô hình phân quyền hai lớp và ma trận C-04

> **Trạng thái: Đang dùng làm thiết kế kiểm soát.** Ngày: 2026-11-21.  
> Phạm vi: mọi route/API/RPC của money.aiecom.vn. Tài liệu này không tự cấp quyền, không thay RLS và không thay đổi dữ liệu production.

## 1. Quyết định nền tảng

Một thao tác chỉ hợp lệ khi đồng thời qua **bốn cổng**, theo đúng thứ tự:

```
phiên hợp lệ + tài khoản active
        ∧ capability cho hành động
        ∧ scope chứa đúng bản ghi/tài sản
        ∧ quy tắc trạng thái, phân tách nhiệm vụ và audit
```

- **Role** trả lời “thuộc loại tài khoản nào/nhận template quyền khởi đầu nào”; không tự là quyền xem hoặc sửa mọi dữ liệu.
- **Capability** trả lời “được thực hiện hành động nào trên module nào”. Capability là allow-list, có thể cấp/thu hồi độc lập, không suy ra từ việc UI hiện nút.
- **Scope tài sản/dữ liệu** trả lời “được tác động dòng nào”. Có quyền `sales_inventory.reserve` không mặc định được giữ bất kỳ Page nào; phải có scope đơn hoặc scope kho tương ứng.
- **State/evidence** trả lời “có được làm ở thời điểm này không”. Có `finalize` không được hoàn tất đơn chưa thanh toán, không được tự xác minh đơn 0đ của mình, và không được bỏ qua xác nhận bàn giao ngoài hệ thống.

`super_admin` là break-glass toàn quyền kỹ thuật theo quy ước hiện hành, nhưng vẫn bị ghi audit và không được dùng như tài khoản vận hành thường nhật. `platform_admin` chỉ là quản trị nền tảng trong capability matrix; trong giai đoạn chuyển tiếp hệ thống vẫn cấp all capability cho role này để tương thích, nhưng mọi endpoint mới không được hard-code role thay cho capability.

## 2. Hai lớp phạm vi bắt buộc

### Lớp A — quyền toàn hệ thống

Áp dụng cho cấu hình, chính sách, dữ liệu xuyên tài sản và hành động có ảnh hưởng nhiều người. Ví dụ: quản lý tài khoản, giá/chiết khấu, mã ưu đãi, chính sách hoa hồng, cấu hình SePay/Google/Meta, bổ nhiệm quản lý, xuất hóa đơn, quản lý capability.

Các capability gợi ý chuẩn hóa:

| Family | Capability | Ý nghĩa |
| --- | --- | --- |
| `identity` | `users.read`, `users.manage`, `roles.grant` | Đọc/quản trị hồ sơ, cấp quyền — không thay email đăng nhập của người khác |
| `organization` | `reporting_lines.manage`, `assignments.manage` | Quản lý tuyến và chỉ định tài sản |
| `catalog` | `products.manage`, `price_schedule.manage`, `discount_schedule.manage`, `promo.manage` | Cấu hình sản phẩm/giá/chiết khấu/mã; cần lịch hiệu lực |
| `sales_orders` | `read_all`, `assign`, `payment_reconcile`, `invoice.manage` | Xem toàn bộ, phân công, đối soát, xử lý hóa đơn |
| `sales_inventory` | `read`, `intake`, `publish`, `reserve`, `release`, `finalize`, `assign_inhouse`, `writeoff`, `warranty` | Kho Fanpage; từng action tách riêng |
| `sales_operations` | `manage_payout`, `read_reports_all`, `verify_reports` | Payout và báo cáo vận hành |
| `integrations` | `sepay.manage`, `google_resources.manage`, `meta.manage` | Bí mật/cấu hình tích hợp chỉ server-side |
| `finance` | `commission_policy.manage`, `commission.approve`, `payout.approve` | Chính sách và duyệt chi, chưa đồng nghĩa chuyển tiền |
| `audit` | `read`, `export` | Chỉ đọc/xuất audit theo nhu cầu kiểm soát |

### Lớp B — quyền mặc định trên tài sản của mình

Đây là **scope dữ liệu**, không phải capability mới. Mặc định đề xuất:

| Người dùng/tài sản | Được mặc định | Không được suy ra |
| --- | --- | --- |
| Khách vãng lai | Chỉ catalog public | Đơn, kho, báo cáo, dữ liệu cá nhân |
| Người mua có tài khoản | Hồ sơ của mình; đơn có `buyer_user_id` bằng mình | Đơn của người cùng email, kho Page, đơn của CTV |
| Người mua guest | Chỉ đơn qua tracking token hết hạn; không claim lại bằng email | Đăng nhập vào đơn hoặc quyền Page |
| CTV bán hàng | Mã giới thiệu/công nợ hoa hồng của chính mình sau khi policy chốt | Đơn đầy đủ của khách hoặc sửa giá/mã |
| CTV nội dung/nhân sự | Page **được giao trực tiếp**: xem dữ liệu vận hành được phép, nộp báo cáo của mình, mở đúng kho ảnh/video được grant | Duyệt báo cáo, xem bank payout, giao người khác, thay cấu hình Page |
| Quản lý | Đọc tài sản/báo cáo thuộc tuyến active; duyệt khi có capability và không phải bản ghi của mình | Tự động có `read_all`, tài chính, writeoff hoặc quyền trên tuyến không thuộc mình |
| Nhân viên sale/kho | Đơn được phân công và kho theo scope action đã cấp | Page Inhouse/các đơn không được phân công chỉ vì có role operator |

Nguồn scope hợp lệ hiện có: `buyer_user_id`, `sales_order_assignments`, `page_assignments`, `page_access`, `user_reporting_lines`, `team_memberships`, `payment_profile_access` và explicit resource grant ảnh/video. Được phép phải dựa trên nguồn có trạng thái `active`, khoảng thời gian hiệu lực hợp lệ; scope kế thừa quản lý là **read visibility** mặc định, không tự biến thành quyền ghi/duyệt.

## 3. Phân tách bốn loại tài sản — không dùng một scope thay thế tài sản khác

| Tài sản | Chủ thể scope chính | Action nhạy cảm | Quy tắc bắt buộc |
| --- | --- | --- | --- |
| Fanpage kho tổng | item/ledger + product | nhập, publish, reserve, release, writeoff, warranty | capability kho + transaction/RPC + trạng thái tồn kho; không dựa vào Page Inhouse |
| Fanpage Inhouse | Page assignment/resource grant | giao người, sửa tên, report, payout, mở Sheet | direct/managed assignment + capability theo action; link Sheet không mở sharing Google |
| Đơn hàng | buyer/guest tracking/assignee/read_all | phân bổ, xác minh 0đ, bắt đầu/cấp xong bàn giao, bảo hành | scope đơn độc lập scope Page; guest không thành nhân sự |
| Payout/tài chính | payment profile access + Page liên kết | xem chi tiết, gắn payout, duyệt/chi | tách dữ liệu tài khoản ngân hàng, nguyên tắc maker-checker |

## 4. Ma trận route/API/RPC hiện hành và yêu cầu đóng gap

| Bề mặt | Entry/capability | Scope | Kiểm tra server/RPC đang có | Gap/việc C-04 |
| --- | --- | --- | --- | --- |
| `/account`, `profile_self_save` | session active; self profile write | own profile | RPC không nhận role/email từ client | Ghi thành capability `identity.profile.self`; test suspended/deleted/token khác |
| `/sales`, checkout | public hoặc buyer active | guest tracking hoặc buyer own | server quote + checkout RPC; guest không claim bằng email | Định nghĩa public endpoint catalog tách hẳn admin capability |
| `/sales-orders`, `sales-orders` | buyer own / assignee / `sales_orders.read_all` | order scope | `visibleSalesOrders`; staff action kiểm tra assignment/read_all/admin | Tách capability `read_all`, `assign`, `payment_reconcile`, `invoice.manage`; test manager không tự read_all |
| `sales_fulfillment`, `sales_order_allocate/finish/warranty` | `sales_inventory.reserve/finalize/warranty` | assigned order/read_all/admin | RPC transaction + state/evidence | Thiết kế recipient snapshot và maker-checker; không dùng scope Page để mở đơn |
| `/inventory-fanpages`, `sales_inventory_command` | từng `sales_inventory.*` | kho/sản phẩm + order khi reserve/finalize | capability helper và RPC service-only | Chuẩn hóa product scope, quota/expiry delegation và denied matrix |
| `/inventory-inhouse`, `/access` | `read`, `assign_inhouse`, `manage_payout` tùy action | direct Page / manager subtree / admin all | access context + API/RPC | Tách rõ read inventory và contact/assignment detail; asset assignment expiry |
| `/daily-reports`, `content_report_command` | submit own; `verify_reports` | direct assignment; manager subtree only | report command scope + no self approval | Thêm policy evidence tối thiểu, reviewer role/chain, test indirect manager |
| `/payout`, `inhouse_payout_save` | `manage_payout` | Page/payout access | server RPC | Tách `payout.view_masked` với `payout.manage`; maker-checker cho payment data |
| `/users`, `/team`, permission editor | `identity.users.manage`, `roles.grant`, `organization.*` | toàn hệ thống hoặc branch được ủy quyền rõ | hiện nhiều chỗ hard-code admin | Không triển khai role mới trước khi migration grant/audit/expiry được chốt |
| `/connect-meta`, `/api/meta/start` | `integrations.meta.manage` | system | `requirePlatformAdmin`; đã sửa nhận super_admin | Meta đang cách ly: không dùng dữ liệu sync làm quyền/tồn kho/báo cáo mới |
| SePay webhook | secret verification, không phải user role | order matching/event id | atomic RPC/idempotency | Tách webhook machine identity khỏi RBAC nhân sự; review secret rotation/audit |

## 5. Mâu thuẫn/rủi ro đã xác định

1. **Role và capability bị trộn:** nhiều endpoint legacy hard-code `platform_admin`, trong khi phần kho dùng JSON capability. Mọi endpoint mới phải theo capability; endpoint cũ được inventory và thay thế dần.
2. **`platform_admin` hiện là all-access ngầm:** tương thích tạm thời, nhưng không đáp ứng “phân quyền chủ động”. Cần transition template → explicit grants, trước khi thu hẹp mặc định.
3. **`read_all` không là quyền quản lý:** nó chỉ mở đọc toàn bộ đơn; không được suy ra approve, reserve, finalize, payout hay invoice.
4. **Scope manager cần tách read/write:** manager nhìn tuyến dưới không mặc định sửa/duyệt; đặc biệt không tự duyệt báo cáo/hoa hồng của bản thân.
5. **Một Page có nhiều người:** assignment phải có `assignment_role`, hiệu lực, người giao và kết thúc; kết quả/hưởng hoa hồng theo assignment-person-day, không theo Page chung.
6. **Nhạy cảm tài chính cần maker-checker:** người tạo giá/chiết khấu/mã/điều chỉnh payout hoặc writeoff không được là người duyệt cùng bản ghi; `super_admin` break-glass phải có lý do/audit.
7. **Không dùng client claim:** email, `user_metadata`, hidden buttons, query `user_id`, hoặc link Google không phải bằng chứng quyền.

## 6. Lộ trình triển khai không gây vỡ quyền hiện hữu

1. **Inventory (không đổi quyền):** lập `effective_authorization()` ở server để trả capability + scope source + expiry; log chế độ shadow cho endpoint hiện tại. Không đổi RLS.
2. **Ma trận kiểm thử âm quyền:** fixture cho guest, buyer, CTV, operator, manager direct/indirect, delegated staff, platform_admin, super_admin, suspended, preview. Mỗi action có allow + deny + revoked/expired + concurrent retry.
3. **Grant có audit/expiry:** thay `permissions` JSON ghi đè bằng bảng grant additive (`principal`, `capability`, `scope_type`, `scope_ref`, `valid_from`, `valid_until`, `granted_by`, `reason`, `revoked_at`). Giữ JSON chỉ đọc tương thích trong một release có migration/backfill/rollback.
4. **Endpoint migration:** users/team → orders → inventory → payout/report → integrations. Mỗi endpoint chỉ chuyển sau khi contract/RLS/RPC/test denied cập nhật cùng release.
5. **Sensitive approval:** thêm request/approve state, không sửa thẳng record tài chính; không tự kích hoạt payment transfer, Google sharing hoặc Facebook access.

## 7. Gate nghiệm thu C-04

- Mỗi route/API/RPC xuất hiện đúng một dòng trong matrix: entry, capability, scope, state guard, audit và test file.
- Không role nào nhận quyền ghi chỉ vì thấy asset; không resource nào đọc ra ngoài scope rồi mới lọc tại browser.
- `super_admin` có full access đúng quy ước; `platform_admin`/manager/staff chỉ đúng capability được cấp.
- Test bắt buộc: own vs foreign, direct vs inherited, active vs expired/revoked, self-approval deny, preview write deny, guest tracking expiry, webhook replay, retry/concurrency.
- Bất kỳ schema/RLS/RPC change nào phải qua C-06 semantic verification trước khi chạy production.
