# Specification migration additive C-04/C-05

> **Trạng thái: Pha A đã generate local, chưa apply.** Ngày: 2026-11-21.
> Căn cứ: [fingerprint production](production-schema-fingerprint-20261121.md), [mô hình quyền](authorization-model-and-c04-matrix-20261121.md), [vai trò vận hành](member-operating-roles-20261121.md).

## Ranh giới release

Release này chỉ xử lý Fanpage group 1 và quyền/vòng đời liên quan. Không đụng Meta sync, chia sẻ Google, SePay secret, nhóm Skill/khóa học/thuê bao hoặc chuyển tiền thật.

Không chạy lại migration cũ thiếu history. Migration **mới** `20261121050200_authorization_branch_fulfillment_foundation.sql` đã được tạo bằng Supabase CLI (`supabase migration new`), chỉ tồn tại local/Git và chưa apply production.

Kiểm tra hiện có: `git diff --check` và 51 Node tests pass. SQL rollback test `supabase/tests/authorization_branch_foundation_rollback.sql` đã được thêm nhưng **chưa chạy** vì local Supabase database/CLI workflow chưa được khởi tạo; không dùng production làm nơi thử DDL.

## Pha A — nhánh sản phẩm và grant tường minh

### Dữ liệu cần thêm

1. `product_branches`: mã/nhãn/status/manager owner/audit; một branch là đơn vị scope kho.
2. `sales_products.product_branch_id` nullable lúc backfill, sau preflight mới enforce non-null cho product Fanpage active.
3. `authorization_grants`: principal, capability family/action, scope type (`branch`, `page`, `order`, `inhouse_assets`, `all`), scope ref, `valid_from`, `valid_until`, `granted_by`, reason, revoked fields/audit.

### Không làm trong Pha A

- Không xóa `profiles.permissions` JSON. Đọc JSON và grant mới song song bằng effective authorization; có shadow log khác biệt.
- Không đổi role legacy hoặc dữ liệu assignment hiện hữu.
- Không tự cấp scope all cho manager.

### Preflight/backfill

- Mỗi product Fanpage active phải có một branch; sản phẩm draft có thể chưa gán.
- Hàng/đơn Page giữ link product nên suy ra branch; không update hàng ở trạng thái `reserved` nếu chưa có rollback plan.
- Grant migration chỉ seed explicit cho platform/super admin và các quyền đã có trong JSON; không suy diễn quyền mới từ `manager`.

## Pha B — vòng đời kho và giao từng Page

### State additive

1. Inventory item: thêm `withdrawn`, `expired`, `retired`; không tái dùng `damaged`.
2. Ledger action: thêm `withdrawn`, `expired`, `retired`, `relisted` với reason bắt buộc.
3. Order inventory item: thêm delivery state `allocated`, `handover_started`, `delivered`, `delivery_failed`; giữ state cũ để tương thích và backfill `reserved → allocated`.
4. Order fulfillment aggregate: thêm `partial_delivered`; tính từ dòng Page, không nhận giá trị tùy ý từ browser.
5. Delivery evidence: actor, started/delivered/failed timestamps, note/evidence reference trên dòng Page hoặc bảng immutable event nếu payload cần mở rộng.

### RPC/API thay đổi

- `sales_inventory_command`: action `withdraw`, `relist`, `retire`; kiểm tra capability + branch scope; `retire` yêu cầu manager đúng branch hoặc platform/super admin, reason bắt buộc.
- `sales_order_allocate`: tiếp tục nhận order dù hàng bằng 0; trả count `required/allocated/debt/delivered`; không lỗi chỉ vì thiếu kho.
- `sales_order_finish`: thay action cấp đơn bằng action theo `inventory_item_id`; chỉ aggregate `completed` nếu mọi Page đã `delivered`.
- `sales_inventory_command('verify_zero')`: dùng capability `sales_orders.verify_zero`; employee-created order cần reviewer manager thuộc branch; manager/platform-created internal order auto verified; public/guest zero order không auto verify.
- API order grid/detail: trả cột debt/allocated/handover/delivered/failed, dữ liệu khách snapshot và audit tối thiểu theo scope.

### Invariant/rollback

- Một Page không active allocation cho hai đơn; index partial hiện hữu phải giữ/mở rộng tương thích.
- `retired` không quay lại available bằng command thường; không hủy/xóa ledger.
- `withdrawn` có thể relist qua publish/relist có audit.
- Đơn paid chỉ chuyển `completed` sau delivery evidence từng Page; đơn partial không mất phần debt khi retry.
- Nếu transaction fail giữa item/order/ledger, rollback toàn bộ.

## Test bắt buộc

| Nhóm | Case tối thiểu |
| --- | --- |
| Branch scope | Nhân viên branch A không intake/publish/reserve/retire hàng B; manager A có capability thì được; manager không capability bị deny. |
| Grant expiry | Grant active allow; expired/revoked deny; scope all chỉ cho grant explicit. |
| Đơn thiếu kho | Checkout quantity lớn hơn stock và stock 0 đều tạo `page_debt`; không checkout fail do thiếu hàng; có hàng mới thì allocate idempotent. |
| Delivery | Nhiều Page: delivered một phần + debt một phần thành `partial_delivered`; completed chỉ khi đủ delivered; retry không ghi ledger/evidence trùng. |
| Zero value | Employee-created internal order cần manager đúng branch; manager/platform created theo rule; guest/public không auto verify; self-approval rule đúng. |
| Lifecycle | Withdraw/relist/expired/retire theo capability; retire paid/reserved item bị deny; reason/audit/rollback đầy đủ. |
| Negative security | guest, buyer, foreign assignee, direct vs inherited manager, preview, cross-branch, anon/authenticated direct RPC. |

## Trình tự phát hành

1. Cài/khôi phục Supabase CLI hoặc dùng workflow migration được quản trị chấp thuận; generate migration file.
2. Chạy schema preflight đúng project `tlcjcqqnfjrqsoiaalfk`; review advisor/security.
3. Chạy SQL rollback test trên local/staging; review kết quả, rồi commit migration + API + UI + Node/SQL tests + docs trong cùng release.
4. Apply production một lần; chạy semantic postflight và test denied; ghi SHA/deployment/migration vào release register.
5. Bật UI capability/branch sau khi dữ liệu/backfill verification đạt; không mở quyền chỉ để tránh màn hình trống.
