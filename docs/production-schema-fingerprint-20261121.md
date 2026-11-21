# Fingerprint schema production và quy trình C-06

> **Trạng thái: Đang dùng.** Kiểm tra lúc 2026-11-21 trên Supabase production `tlcjcqqnfjrqsoiaalfk` (dashboard: `supabase-alizarin-magnet`). Đây là bằng chứng semantic, không phải ủy quyền chạy DDL.

## Kết luận an toàn

Migration history và schema production **không đồng nhất**, nhưng các đối tượng quan trọng đại diện cho nhóm migration thiếu history đã hiện diện trên production. Vì vậy:

- Không insert thủ công row vào `supabase_migrations.schema_migrations` để “làm sạch” history.
- Không chạy lại các migration thiếu history.
- Mọi thay đổi tiếp theo dùng migration mới, additive/idempotent, sau khi có fingerprint riêng và test rollback/deny.

## Phạm vi history đã đối chiếu

Trong 18 version sales/profile cần kiểm tra, production history có 11 row: `20261119210000`, `20261119215000`, `20261119220000`, `20261119223000`, `20261119224000`, `20261119230000`, `20261119231000`, `20261119232000`, `20261119233000`, `20261119234000`, `20261119235000`.

Không có row history cho: `20261119090000`, `20261119113000`, `20261119150000`, `20261119170000`, `20261119193000`, `20261119203000`, `20261120103000`.

## Fingerprint semantic đã chạy

Truy vấn chỉ đọc trên đúng production kiểm tra 14 object/cột/function thuộc các migration thiếu history:

- Tables: `sales_products`, `sales_orders`, `sales_discount_tiers`, `sales_invoice_records`, `sales_settings`, `sales_product_prices`, `sales_promo_codes`, `sales_inventory_items`, `fanpage_inventory_details`.
- Columns: `sales_orders.payment_expires_at`, `sales_orders.zero_value_verification_status`, `fanpage_inventory_details.page_name`.
- Functions: `sales_process_payment_event`, `profile_self_save`.

**Kết quả: 14 checked / 14 present / 0 missing.**

Kiểm tra quyền bổ sung xác nhận các bảng sales representative có `relrowsecurity = true` và `authenticated_select = false`; các function nội bộ được kiểm tra không cấp EXECUTE cho `authenticated`. Điều này phù hợp với kiến trúc API server/service-role hiện tại, không phải chứng cứ cho phép client gọi trực tiếp RPC.

## Giới hạn fingerprint hiện tại

Fingerprint này chưa thay thế các kiểm tra trước DDL mới sau đây:

1. Hash/body/signature chính xác của từng function và trigger.
2. RLS policy, index, constraint và grant của mọi bảng liên quan.
3. Các object phụ từ migration nền: `sales_order_assignments`, `sales_payment_events`, ledger/report/commission, cũng như dữ liệu tương thích.
4. Tương thích giữa schema hiện hữu và policy mới về product branch, grant expiry, `verify_zero`, `withdrawn`/`expired`/`retired`, giao từng Page.

## Cảnh báo chọn đúng project

Connector Supabase trong phiên này trả project khác `aqqafiievlimhilyiozf`. Không có truy vấn hay ghi DDL nào được thực hiện vào project đó. Mọi bằng chứng trong tài liệu này lấy từ dashboard production `tlcjcqqnfjrqsoiaalfk`; trước mỗi migration phải xác minh lại ref này với cấu hình deployment Vercel.

## Gate cho migration C-04/C-05 tiếp theo

1. Lập migration mới chỉ thêm: product branch, authorization grant có expiry/audit, trạng thái hàng, trạng thái giao từng Page và capability mới.
2. Viết test SQL/API: cross-branch deny, manager without capability deny, employee zero-order requires branch manager, partial delivery, retire deny/rollback/retry.
3. Query production preflight: table/column/constraint/function/policy/grant cần tác động; lưu kết quả vào release register.
4. Review security: RLS, `SECURITY INVOKER`, revoke public/authenticated function EXECUTE, API actor lấy từ session, preview write deny.
5. Chỉ sau review mới apply migration vào `tlcjcqqnfjrqsoiaalfk`, chạy test semantic hậu deploy và cập nhật release register.
