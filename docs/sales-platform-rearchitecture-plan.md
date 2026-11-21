> **Nguồn trạng thái hiện hành:** [Kế hoạch chấn chỉnh tính nhất quán và kiểm soát](reconciliation-control-plan-20261121.md). Snapshot `8ba970c` trong [đối chiếu điểm tạm dừng](project-status-and-next-gate-20261119.md) là lịch sử, không phải baseline release hiện hành.
# Kế hoạch tái cấu trúc nền tảng sản phẩm và vận hành

**Trạng thái:** `Roadmap`  
**Ngày khởi tạo:** 2026-11-19  
**Phạm vi:** thống nhất catalog sản phẩm, tồn kho Fanpage, đơn hàng, quyền lợi, nhân sự và báo cáo vận hành; không mở rộng đồng bộ Facebook trong giai đoạn này.

## Quyết định đã chốt

1. Có bốn nhóm sản phẩm, có thể mở rộng; mỗi sản phẩm có `product_type` và một fulfillment riêng.
2. Giai đoạn đầu chỉ mở nhóm **Fanpage**. Ba nhóm còn lại chỉ dựng mô hình dữ liệu, RBAC và feature flag, không mở bán.
3. Chỉ định tài sản Page vẫn do quản lý thực hiện sang cộng tác viên; không tự cấp quyền trực tiếp từ checkout.
4. Đồng bộ Facebook/API và báo cáo hiện có được cách ly: không dùng làm nguồn nhập kho, không thay schema/luồng hiện hữu trong đợt này.
5. Fanpage bán giá 0 đồng không tạo QR; phải được nhân viên có quyền xác minh và quản lý chỉ định trước khi bàn giao.
6. Có **kho Page tổng** và **kho Inhouse**. Bán ngoài làm mất Page khỏi kho tổng; bán Inhouse chuyển Page từ kho tổng sang kho Inhouse, không còn phụ thuộc đồng bộ Meta để có Page đầu vào.
7. Báo cáo và hoa hồng là theo từng nhân sự–Page assignment; nhiều người cùng xử lý một Page có kết quả và quyền lợi độc lập.
8. Google Sheet là nguồn đọc một chiều để hiển thị trực quan trên hệ thống; hệ thống không ghi ngược về Sheet.

## Mô hình sản phẩm mục tiêu

| Nhóm | Fulfillment | Tồn kho | Trạng thái giai đoạn 1 |
| --- | --- | --- | --- |
| Fanpage | Bàn giao Page, quyền quản trị và thông tin tài sản | Mỗi mã hàng bán một lần, giảm tồn kho ngay khi đơn hoàn tất | `Đang triển khai` |
| Skill đóng gói | Cấp link/tệp tải xuống | Không giới hạn tồn kho | `Roadmap` |
| Khóa học đóng gói | Cấp quyền xem bài học và Zoom | Không giới hạn; quyền truy cập theo enrollment | `Roadmap` |
| Thuê bao | Cấp quyền có ngày hết hạn | Không dùng tồn kho; dừng quyền lợi khi hết hạn không gia hạn | `Roadmap` |

### Fanpage: nguồn sự thật về kho

Tạo `inventory_items`/`fanpage_inventory_details`, không dùng trực tiếp `pages` làm kho:

- mã hàng bất biến, trạng thái `draft → available → reserved → external_sold/cancelled`;
- ID Page, link, tài khoản quản trị hiện tại, BM hiện tại (tùy chọn), giá nhập, ngày/nguồn nhập, chứng từ nội bộ;
- một dòng `order_item` chỉ tham chiếu một mã hàng; transaction khóa hàng theo cách nguyên tử để không bán trùng;
- Bán ngoài: Page đạt `external_sold`, rời kho tổng và không được đưa vào kho Inhouse.
- Bán Inhouse: transaction nguyên tử chuyển Page `available/reserved → inhouse_active`, giảm kho tổng và tạo record kho Inhouse; Page đó là nguồn nhập trực tiếp cho module quản lý/báo cáo Page, không yêu cầu discovery hay sync Meta.
- `pages` kế thừa dữ liệu của kho Inhouse với `source = inhouse_inventory_transfer`; giữ order, nhân viên xác minh và thời điểm chuyển kho làm provenance, không giả là dữ liệu đồng bộ Meta.

### Kho Inhouse

Kho Inhouse là tập Page đang được vận hành nội bộ, có quan hệ một-một với mã hàng gốc và Page registry. Nó lưu trạng thái vận hành (`awaiting_assignment`, `active`, `suspended`, `retired`), quản lý phụ trách, thời điểm nhận kho và lý do rời kho. Không được xóa Page lịch sử khi chuyển trạng thái; rời kho chỉ kết thúc hiệu lực assignment/quyền lợi.

## Phân quyền và vai trò

Không thêm role theo từng màn hình. Dùng role chuẩn hiện có và thêm permission có scope theo nhóm sản phẩm.

| Nhóm nghiệp vụ | Role/permission mục tiêu | Phạm vi |
| --- | --- | --- |
| Khách vãng lai | anonymous | Chỉ đọc catalog công khai |
| Người mua không tài khoản | order guest | Tạo/xem mã đơn giới hạn, không có quyền hệ thống |
| CTV bán hàng | `affiliate` permission | Mã giới thiệu, doanh số/hoa hồng của chính mình |
| CTV nội dung | `content_contributor` permission | Báo cáo theo assignment Page, hoa hồng nội dung |
| Nhân viên sale | `sales_inventory` permission | Nhập kho/bán theo product scope được cấp |
| Nhân viên Inhouse | `inhouse_fulfillment` permission | Xác minh đơn 0đ và bàn giao đơn được chỉ định |
| Quản lý | `manager` + scope cây tổ chức | Báo cáo trực tiếp/kế thừa, chỉ định Page và nhân sự |
| Platform admin | `platform_admin` | Cấu hình nghiệp vụ toàn nền tảng theo permission |
| Super admin | `super_admin` | Toàn quyền có audit |

Mọi action ghi tài chính/tồn kho/bàn giao phải kiểm tra server-side, RLS, scope sản phẩm và audit. Hiding UI không phải quyền.

## Luồng nghiệp vụ giai đoạn 1: Fanpage

```text
Nhập kho → duyệt/available → khách tạo đơn → reserve mã hàng
                                         ├─ trả tiền: SePay xác nhận → paid
                                         └─ 0đ: chờ Inhouse xác minh → verified
paid/verified → quản lý chỉ định CTV/nhân viên nhận Page → handover → sold
```

- Giá bán, bậc chiết khấu và mã ưu đãi phải có hiệu lực theo thời điểm và được snapshot vào `order_item`.
- Mã ưu đãi và mã giới thiệu là hai thực thể độc lập. Mã giới thiệu chỉ ghi nhận attribution/hoa hồng khi đơn thành công.
- Quà tặng chỉ được cấp sau `paid` hoặc `verified`, qua quyền tải có chữ ký/hết hạn; không trả link tĩnh khi tạo đơn.
- Khi reserve hết hạn hoặc đơn huỷ, mã hàng phải trả lại `available` theo job idempotent.

## Báo cáo CTV nội dung

Tạo báo cáo ngày theo **assignment**, không chỉ theo Page:

- mỗi người xử lý cùng một Page là một assignment riêng; số liệu, báo cáo và hoa hồng thuộc assignment đó, không chia đều/ghi đè theo Page;
- mỗi ngày mọi nhân sự có assignment active phải nộp báo cáo: số bài đăng, số tiền thu được của ngày trước, số tiền luỹ kế hiện tại và nguồn/bằng chứng;
- dashboard có hai trục: **theo nhân sự** (từng nhân sự và assignment) và **theo Page** (tổng của các assignment hợp lệ);
- quản lý xem báo cáo `direct`, `inherited` hoặc `direct_and_inherited`, nhưng số liệu chỉ được cộng vào quyền lợi quản lý sau khi có quy tắc/approval xác minh rõ ràng; mặc định chỉ là visibility, không tự cộng dồn;
- chính sách hoa hồng versioned/effective-dated gồm `đơn giá × số bài hợp lệ + phần trăm × doanh thu hợp lệ`; công thức, kỳ chốt, điều kiện duyệt và quy tắc làm tròn được snapshot trên từng kết quả;
- thiếu báo cáo không được ghi 0 doanh thu: hiển thị trạng thái `missing`, có nhắc việc và giữ tách khỏi tổng chốt hoa hồng.

### Google Sheet read-only

Mỗi assignment có thể gắn một nguồn Google Sheet đã được cấp quyền đọc qua kết nối server-side. Worker chỉ đọc, chuẩn hóa và hiển thị các hàng/metric trên bảng hệ thống; không có endpoint, token hay UI nào được phép ghi ngược về Sheet. Mỗi lần import lưu `source_sheet_id`, thời điểm đọc, checksum/range và trạng thái lỗi để có thể đối chiếu.

## Tích hợp dữ liệu Page hiện hữu

1. Giữ các bảng Meta/sync, snapshot và báo cáo hiện có ở module riêng.
2. Tạo relation rõ giữa inventory Fanpage và `pages.registry_id` khi có; không bắt buộc gọi Meta khi nhập kho.
3. Page từ đơn 0đ được import vào registry qua endpoint kiểm soát, gắn nguồn/đơn/nhân viên xác minh; không đưa vào sync hàng ngày mặc định.
4. Trường "kho nội dung" và báo cáo bài đăng gắn với `page_assignment`; tích hợp Google Sheet là `Roadmap`, dùng connector server-side, không đưa token vào browser.

## Kế hoạch triển khai theo cổng

| Cổng | Phạm vi | Điều kiện qua cổng |
| --- | --- | --- |
| 0. Chuẩn hóa | Ghi quyết định, trạng thái, role × permission, inventory/order contract | Không còn yêu cầu mâu thuẫn chưa đánh dấu `Blocked` |
| 1. Nền dữ liệu | Migration additive, RLS, audit, fixture, rollback note | Test khóa tồn kho và user không quyền bị từ chối |
| 2. Fanpage inventory | Kho tổng, kho Inhouse, giá nhập, reserve/external-sold/transfer, chỉ định tài sản | Không bán trùng, truy được provenance và chuyển kho nguyên tử |
| 3. Checkout & payment | Order item, pricing snapshot, SePay, đơn 0đ | Không QR với 0đ, webhook idempotent |
| 4. Handover & reports | Assignment, báo cáo ngày, dashboard Page/nhân sự, quản lý trực tiếp/kế thừa, Sheet read-only | Tổng Page/tổng nhân sự đúng, không tự cộng quyền lợi quản lý, có audit |
| 5. Khung nhóm 2–4 | Product type/fulfillment interface và feature flags | Không làm ảnh hưởng kho Fanpage |
| 6. Mở bán | Preview, responsive 390/768/desktop, release/runbook | Production checklist hoàn tất |

## Blocker cần chốt trước Gate 2

1. Thời hạn reserve của từng mã Fanpage trước khi trả về kho tổng.
2. Công thức/đơn giá cụ thể theo bài, tỷ lệ doanh thu, kỳ chốt, ngưỡng/rank và quy tắc làm tròn hoa hồng.
3. Điều kiện xác minh để quản lý được hưởng quyền lợi từ nhánh trực tiếp/gián tiếp.
4. Danh sách quyền Inhouse/Sale được cấp trên từng product group.
5. Cấu trúc Sheet chuẩn, phạm vi đọc và tài khoản Google được cấp quyền server-side.

## Tài liệu bắt buộc khi có thay đổi

- `docs/database.md`: schema, migration, RLS, dữ liệu tương thích.
- `docs/api-reference.md`: action, request/response, permission và lỗi.
- `docs/runbook.md` và `docs/testing.md`: vận hành, rollback, fixture, RBAC/responsive QA.
- `docs/roadmap.md`: trạng thái và dependency; không xóa lịch sử.
- release note: commit, migration đã chạy, deployment `READY`, kết quả kiểm thử.
