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

## Mô hình sản phẩm mục tiêu

| Nhóm | Fulfillment | Tồn kho | Trạng thái giai đoạn 1 |
| --- | --- | --- | --- |
| Fanpage | Bàn giao Page, quyền quản trị và thông tin tài sản | Mỗi mã hàng bán một lần, giảm tồn kho ngay khi đơn hoàn tất | `Đang triển khai` |
| Skill đóng gói | Cấp link/tệp tải xuống | Không giới hạn tồn kho | `Roadmap` |
| Khóa học đóng gói | Cấp quyền xem bài học và Zoom | Không giới hạn; quyền truy cập theo enrollment | `Roadmap` |
| Thuê bao | Cấp quyền có ngày hết hạn | Không dùng tồn kho; dừng quyền lợi khi hết hạn không gia hạn | `Roadmap` |

### Fanpage: nguồn sự thật về kho

Tạo `inventory_items`/`fanpage_inventory_details`, không dùng trực tiếp `pages` làm kho:

- mã hàng bất biến, trạng thái `draft → available → reserved → sold/cancelled`;
- ID Page, link, tài khoản quản trị hiện tại, BM hiện tại (tùy chọn), giá nhập, ngày/nguồn nhập, chứng từ nội bộ;
- một dòng `order_item` chỉ tham chiếu một mã hàng; transaction khóa hàng theo cách nguyên tử để không bán trùng;
- `pages` chỉ kế thừa dữ liệu sau khi hoàn tất bàn giao hoặc với đơn Inhouse 0đ, có `source = sales_zero_value_input`; giữ provenance, không giả là dữ liệu đồng bộ Meta.

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

- mỗi người quản lý cùng một Page là hai assignment riêng;
- mỗi assignment ghi số bài đầu ngày, doanh thu hôm trước, doanh thu luỹ kế, bằng chứng/nguồn và trạng thái duyệt;
- tổng Page là aggregate của assignment đã hợp lệ, không ghi đè số của từng người;
- chính sách hoa hồng versioned/effective-dated, đánh giá theo số bài và doanh thu;
- quản lý nhìn thấy dữ liệu `direct`, `inherited` hoặc `direct_and_inherited` theo access context hiện có.

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
| 2. Fanpage inventory | Nhập kho, giá nhập, reserve/sold/release, chỉ định tài sản | Không bán trùng, truy được provenance |
| 3. Checkout & payment | Order item, pricing snapshot, SePay, đơn 0đ | Không QR với 0đ, webhook idempotent |
| 4. Handover & reports | Assignment, CTV nội dung, quản lý trực tiếp/kế thừa | Tổng Page và tổng cá nhân đúng, có audit |
| 5. Khung nhóm 2–4 | Product type/fulfillment interface và feature flags | Không làm ảnh hưởng kho Fanpage |
| 6. Mở bán | Preview, responsive 390/768/desktop, release/runbook | Production checklist hoàn tất |

## Blocker cần chốt trước Gate 2

1. Trạng thái hợp lệ của mỗi mã Fanpage và thời hạn reserve.
2. Có/không cho phép một Fanpage có nhiều CTV/nhiều người bàn giao cùng lúc.
3. Công thức hoa hồng CTV bán hàng và CTV nội dung, ngưỡng/rank, kỳ chốt và quy tắc đơn tự mua.
4. Danh sách quyền Inhouse/Sale được cấp trên từng product group.
5. Nguồn và yêu cầu bảo mật của Google Sheet ở giai đoạn sau.

## Tài liệu bắt buộc khi có thay đổi

- `docs/database.md`: schema, migration, RLS, dữ liệu tương thích.
- `docs/api-reference.md`: action, request/response, permission và lỗi.
- `docs/runbook.md` và `docs/testing.md`: vận hành, rollback, fixture, RBAC/responsive QA.
- `docs/roadmap.md`: trạng thái và dependency; không xóa lịch sử.
- release note: commit, migration đã chạy, deployment `READY`, kết quả kiểm thử.
