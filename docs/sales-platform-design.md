# Thiết kế sản phẩm, giao diện và luồng vận hành Sales Platform

**Trạng thái:** `Roadmap` — thiết kế đã chốt, chưa thay đổi route/menu production.  
**Phụ thuộc:** [Kế hoạch tái cấu trúc](sales-platform-rearchitecture-plan.md), [RBAC](security-permissions.md), [Frontend](frontend.md).

## 1. Ranh giới thiết kế

Sales Platform quản lý catalog, kho Fanpage, đơn hàng, bàn giao, quyền lợi và báo cáo con người. Module Meta Sync chỉ cung cấp dữ liệu Page/snapshot khi được bật riêng; nó không là điều kiện để nhập kho hoặc vận hành Page Inhouse.

### Product fulfillment contract

Mọi `product` có `product_group`, `sale_status`, pricing version và một fulfillment handler. Không đưa điều kiện riêng của Fanpage vào product core.

| Group | Handler | Mở bán | Ghi chú |
| --- | --- | --- | --- |
| `fanpage` | reserve inventory → payment/verify → handover | Gate 2–4 | Có kho tổng và kho Inhouse |
| `skill_package` | cấp download entitlement | Feature flag tắt | Không trừ tồn kho |
| `course` | enrollment + course/Zoom access | Feature flag tắt | Quyền theo enrollment |
| `subscription` | entitlement có ngày hết hạn | Feature flag tắt | Worker hết hạn chỉ thu hồi quyền, không xóa lịch sử |

## 2. Luồng Fanpage

```text
Nhân viên sale nhập kho tổng
  → quản lý duyệt/available
  → tạo đơn: hệ thống reserve đúng mã hàng
  → trả tiền SePay hoặc Inhouse 0đ xác minh
  → quản lý chỉ định người nhận/bàn giao
  ├─ bán ngoài: external_sold, rời kho tổng
  └─ Inhouse: transfer to inhouse inventory → Page registry (nguồn sales) → active assignment
```

### Điều kiện bất biến

- Một mã hàng Fanpage có tối đa một reservation/đơn active.
- Mọi thay đổi kho ghi `inventory_ledger` bất biến: event, actor, order, thời điểm, trạng thái trước/sau.
- Reservation hết hạn, huỷ đơn hoặc payment thất bại trả hàng về kho bằng job idempotent.
- Đơn 0đ không tạo QR/payment reference có thể thanh toán; chỉ `assigned inhouse staff` hoặc admin xác minh.
- Bàn giao không đồng nghĩa cấp Meta quyền tự động: manager xác nhận rồi tạo assignment/access record theo quy trình hiện có.

## 3. Luồng báo cáo, dashboard và hoa hồng

### Báo cáo ngày

Mỗi ngày, nhân sự có `active page_assignment` nộp một `daily_assignment_report`:

- số bài đăng trong ngày;
- doanh thu ngày hôm trước;
- doanh thu luỹ kế hiện tại;
- nguồn/bằng chứng và trạng thái duyệt.

Thiếu báo cáo là `missing`; không thay số liệu bằng 0. Bản ghi quá hạn chỉ được sửa qua revision/audit, không ghi đè không dấu vết.

### Hai view dashboard

| View | Nhóm dữ liệu | Quy tắc |
| --- | --- | --- |
| Theo nhân sự | nhân sự → assignment → báo cáo/ngày → hoa hồng | số liệu và quyền lợi của chính assignment |
| Theo Page | Page → các assignment → aggregate ngày/kỳ | chỉ tổng các báo cáo hợp lệ; không làm mất kết quả riêng |

Hoa hồng là kết quả đã chốt theo kỳ: `per_post_rate × qualified_post_count + revenue_percentage × qualified_revenue`. Policy phải versioned, có ngày hiệu lực, ngưỡng/rank, round rule và approval state. Manager có visibility theo cây tổ chức nhưng không tự cộng hoa hồng cho đến khi policy/approval cho phép.

### Google Sheet

Sheet là connector `read-only`: server đọc một range được allowlist, lưu snapshot/provenance, rồi hiển thị trên dashboard. Không có nút/sự kiện ghi ngược. Token OAuth/credential không đi qua browser và không hiển thị trong API response.

## 4. Kiến trúc thông tin và menu mục tiêu

Menu này là **target IA**, được đưa vào `auth-nav.js` chỉ tại Gate 4 sau RBAC, route registry và responsive QA. Các route cũ tiếp tục là URL tương thích; không xóa lịch sử.

| Module menu | Route mục tiêu | Ai thấy | Trạng thái |
| --- | --- | --- | --- |
| Tổng quan | `/analytics` | theo access context | `Đang dùng` |
| Catalog & Kho | `/inventory-fanpages` (Gate 2.1), `/catalog`, `/inventory/inhouse` | sale/inhouse/manager/admin theo scope | Kho Fanpage `Thử nghiệm`; phần còn lại `Roadmap`. Route mục tiêu cũ `/inventory/fanpages` không resolve trên Vercel, được thay bằng route tĩnh trước phát hành 2026-11-19. |
| Đơn hàng & Bàn giao | `/orders`, `/handover` | sale/inhouse/manager/admin | `Roadmap` |
| Báo cáo vận hành | `/reports/team`, `/reports/pages`, `/reports/content`, `/reports/revenue` | assignment/manager/admin | `Roadmap` + route cũ giữ tương thích |
| Quyền lợi | `/affiliates`, `/commissions`, `/rank-policies` | CTV, manager, admin theo scope | `Roadmap` |
| Nhân sự & Tài sản | `/team`, `/users`, `/access`, `/groups` | theo RBAC | phần lớn `Đang dùng` |
| Cấu hình | `/settings/products`, `/settings/pricing`, `/settings/promotions`, `/settings/integrations` | platform/super admin | `Roadmap` |
| Đồng bộ Meta | `/connect-meta`, `/sync` | role sync được cấp | `Đang dùng`, cách ly |

### Điều hướng public

- Public chỉ có catalog, chi tiết sản phẩm, FAQ, theo dõi đơn giới hạn và đăng nhập.
- Khách vãng lai không thấy menu nội bộ, kho, báo cáo hoặc cấu hình.
- Người mua không có tài khoản theo dõi đơn bằng token/mã đơn giới hạn thời gian; không cấp dashboard nội bộ.

### Quy tắc responsive

- Desktop: module chính + submenu, không trải phẳng toàn bộ route.
- 768px: menu module giữ tên ngắn, bảng chuyển ưu tiên sang list/card.
- 390px: menu overlay cùng nguồn dữ liệu với desktop; card đơn/kho/báo cáo; hành động tài chính/kho nằm trong sheet/modal có xác nhận.

## 5. Màn hình Gate 2–4

1. **Kho Fanpage:** chỉ số tồn kho, filter trạng thái, nhập kho, nhật ký, reservation; không hiển thị bí mật tài khoản quản trị/Page token.
2. **Chi tiết mã hàng:** metadata Page/BM, giá nhập, lịch sử và liên kết đơn/bàn giao.
3. **Đơn hàng:** items, payment/zero-value verification, pricing snapshot, assignee, fulfillment timeline.
4. **Kho Inhouse:** Page đã chuyển kho, trạng thái vận hành, manager, assignments và link tới báo cáo.
5. **Báo cáo ngày:** form nhân sự, danh sách missing/late, review manager, import Sheet read-only.
6. **Dashboard:** switch "theo nhân sự"/"theo Page"; direct/inherited badge; không gộp quyền lợi chưa xác minh.

## 6. Điểm cần lưu ý trước phát hành

- Không lưu Facebook password, access token, key, link tải quà công khai hay credential Google Sheet trong browser/database thường.
- Cần transaction/lock database cho reserve và transfer kho; UI không được tự quyết tồn kho.
- Không ghi nhận doanh thu/hoa hồng từ webhook chưa xác thực hoặc từ số liệu Sheet chưa được đánh dấu nguồn/trạng thái.
- Mọi kết quả tính tiền phải snapshot policy/version tại thời điểm chốt để thay policy mới không hồi tố đơn/kỳ cũ.
- Không tự mở quyền Page/Meta chỉ vì Page có trong kho Inhouse.
- Không bật cron thu hồi thuê bao hoặc import Sheet cho tới khi có idempotency, error state, audit, retry và runbook.
- Trước mỗi release: migration additive → preview → RBAC negative test → 390/768/desktop → deployment READY → release note.
