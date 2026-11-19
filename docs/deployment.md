# Triển khai Vercel và Supabase

## Supabase

1. Tạo project Supabase.
2. Chạy các migration trong `supabase/migrations/` theo thứ tự timestamp.
3. Kiểm tra Auth Google, redirect URL và RLS.
4. Lưu URL và service-role key chỉ trong Vercel Environment Variables.

## Vercel

Các biến production tối thiểu:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `PLATFORM_ADMIN_EMAIL`
- `CRON_SECRET`
- `DASHBOARD_ADMIN_KEY`
- `ENABLE_SYNC_ORCHESTRATOR` (mặc định `false`)
- `SYNC_DISPATCH_BATCH` (mặc định `1`)
- `META_CONNECTIONS_JSON` hoặc connection lưu trong Database
- `META_PAGE_METRICS`
- `META_POST_METRICS`
- `SALES_PUBLIC_CHECKOUT_ENABLED=true` (Production đã nghiệm thu Test Mode; khi sự cố thanh toán, chuyển ngay về `false` rồi redeploy)
- `SEPAY_WEBHOOK_API_KEY` (secret server-side của webhook SePay; không dùng tên biến `SEPAY_WEBHOOK_TOKEN` đã hết hiệu lực)

Danh sách đầy đủ và phân loại secret/non-secret xem tại [configuration.md](configuration.md).

Deploy production:

```powershell
vercel deploy --prod -y --no-wait
vercel inspect <deployment-url>
```

## OAuth allowlist

Các URL production cần được cấu hình trong Supabase Auth và Google OAuth:

- `https://money.aiecom.vn`
- `https://money.aiecom.vn/analytics`
- `https://money.aiecom.vn/auth/callback` nếu dùng callback riêng

Không dùng URL preview làm callback production lâu dài.

## Quy trình phát hành

1. Kiểm tra diff và secret scan.
2. Chạy syntax check/smoke test.
3. Deploy preview.
4. Kiểm tra Auth, API và responsive.
5. Deploy production.
6. Kiểm tra trạng thái Ready và alias production.
7. Ghi deployment ID vào release note.

### Phát hành line bán hàng Fanpage

1. Apply migration `20261119090000_fanpage_sales_line.sql`, xác nhận bốn bảng có RLS và không có quyền `anon`/`authenticated`.
2. Deploy preview của nhánh trước; đăng nhập Google bằng platform admin, mở `/sales-orders` và xác minh user không phải admin nhận `403` từ API.
3. Thêm `SEPAY_WEBHOOK_API_KEY` ở môi trường Preview, tạo webhook SePay Test Mode trỏ tới `/api/payments/sepay` với Authentication = API Key, rồi dùng giao dịch mô phỏng của Test Mode.
4. Dùng deployment production qua custom domain để Test Mode gọi được webhook (preview bị SSO bảo vệ). Giữ `SALES_PUBLIC_CHECKOUT_ENABLED=false` trong lúc kiểm thử; endpoint `/sales` vẫn hiển thị nhưng không tạo đơn khi cờ tắt.
5. Xác nhận token, mã nội dung, số tiền và idempotency; sau đó đặt `SALES_PUBLIC_CHECKOUT_ENABLED=true` cho Production, redeploy và kiểm tra `/sales` công khai.
6. **Đang dùng từ 2026-11-19:** webhook SePay Live trỏ tới `https://money.aiecom.vn/api/payments/sepay`, chỉ nhận tiền vào MBBank `****0268`, Authentication = API Key, và khóa tương ứng được lưu dạng Vercel Production Secret. Callback thử đã nhận `HTTP 200`; không dùng URL preview làm webhook live.

### Impact note — SePay Live 2026-11-19

| Vùng | Ảnh hưởng |
| --- | --- |
| Chức năng/API | `/api/payments/sepay` giữ nguyên contract và xác thực timing-safe; chuyển nguồn nhận callback từ Test Mode sang Live. |
| Database/RBAC/RLS | Không migration, không thay quyền và không thay policy. Xử lý trùng/đối soát dùng các bảng hiện có. |
| UI/responsive | Không đổi route hay giao diện; không cần QA breakpoint mới. |
| Tích hợp/deploy | Webhook Live #73924, Vercel Production Secret và deployment `dpl_86RZRcYnzfrvLERJh1EmTbtMkGd4` đã đồng bộ; không đổi domain. |
| Dữ liệu/tài liệu | Callback thử chỉ là event kiểm tra, không tạo giao dịch tiền thật; cập nhật configuration, runbook, testing và roadmap. |

### Biến hết hiệu lực

- `SEPAY_WEBHOOK_TOKEN` — **Hết hiệu lực từ 2026-11-19**: tên biến ban đầu trong runbook không khớp code. Thay bằng `SEPAY_WEBHOOK_API_KEY` (commit `207df6e`).
- Quy trình Production chỉ dùng SePay Test Mode — **Hết hiệu lực từ 2026-11-19**: đã thay bằng webhook SePay Live #73924 tới `https://money.aiecom.vn/api/payments/sepay`; Test Mode vẫn giữ cho kiểm thử có kiểm soát ở Preview.

## Trạng thái đồng bộ với GitHub

Repository chuẩn: [nuongndt-aimake/facebook-page-control-tower](https://github.com/nuongndt-aimake/facebook-page-control-tower), nhánh `main`.

Nếu liên kết Vercel với GitHub, không commit `.env`; nếu deploy thủ công, phải ghi lại commit SHA tương ứng trong release note.

### Kiểm chứng phát hành

- Chỉ coi thay đổi là đã lên production khi deployment có trạng thái `READY` và alias production (đặc biệt `money.aiecom.vn`) trỏ đúng deployment đó.
- Deployment ở trạng thái `ERROR`, dù CLI trả về URL tạm thời, không được thông báo là đã phát hành.
- Nếu deploy thủ công lỗi ở bước `Deploying outputs`, chạy `vercel pull --yes --environment production`, `vercel build --yes --environment production`, sau đó deploy lại bằng output đã build; nếu vẫn lỗi, kết nối GitHub và phát hành từ commit `main`.
- Mọi route mới phải có điểm neo trong navigator dùng chung hoặc nút hành động của màn hình liên quan; route chỉ tồn tại qua URL trực tiếp là chưa hoàn chỉnh.
- Gói Vercel hiện tại giữ tối đa 12 Functions production: preview được hợp nhất vào `/api/admin/access`; các API bài viết được hợp nhất vào `/api/analytics` và worker chung `/api/cron/sync`, giữ nguyên URL public qua rewrite.

## Release gần nhất

- Migration: `20261119090000_fanpage_sales_line.sql`.
- Trạng thái: **Đang dùng** — đã apply Supabase production; checkout `/sales` bật ở Production; webhook SePay Live #73924 trả `HTTP 200` qua callback thử.
- Code commit: `42b44bf` (`chore(release): enable public Fanpage checkout after SePay Test callback`).
- Vercel deployment hiện hành: `dpl_86RZRcYnzfrvLERJh1EmTbtMkGd4`, `READY`, aliases gồm `money.aiecom.vn`.
- Nghiệm thu dữ liệu: đơn Test Mode `FS8BD4948AE3`, 10.000 đ, trạng thái `paid`; không có giao dịch tiền thật.

- Migration: `20261101090000_sync_orchestration_foundation.sql`
- Trạng thái: đã apply Supabase production và xác minh 5 bảng/RLS.
- Code commit: `90f73fe` (`feat: add guarded sync job dispatcher`)
- Migration RPC: `20261101100000_sync_job_claim_rpc.sql`.
- Worker/dispatcher: đã có code; pilot 5 Page đạt, nhưng chưa bật production hàng loạt.

# Impact note — Sales chiết khấu và hóa đơn (2026-11-19)

| Vùng | Tác động |
| --- | --- |
| Chức năng | Checkout hiển thị/áp dụng chiết khấu số lượng, hướng dẫn link Facebook, bảo mật dữ liệu và tùy chọn hóa đơn; tương thích đơn cũ. |
| API | `/api/checkout` thêm pricing, invoice input và nhận session tùy chọn; admin thêm xác nhận hóa đơn gộp. |
| Database | Migration `20261119150000_sales_discount_and_invoices.sql` thêm bảng/RLS/index và cột bổ sung an toàn; backfill giá gốc đơn cũ. |
| Phân quyền | Không thêm role. Public chỉ tạo đơn qua server; đọc/xử lý hóa đơn vẫn `platform_admin`/`super_admin` kiểm tra server-side. |
| UI | `/sales` và `/sales-orders`; đã dùng layout một cột ở mobile, bảng admin bọc cuộn ngang. |
| Tích hợp | Không đổi SePay, domain hay cron. Webhook cập nhật trạng thái hóa đơn cùng trạng thái thanh toán. |
| Tài liệu | Đã cập nhật API và database. Production xác minh ngày 2026-11-19: `profiles.phone` được áp dụng an toàn bằng `ADD COLUMN IF NOT EXISTS` sau khi phát hiện thiếu cột; truy vấn kiểm tra xác nhận cột tồn tại. |

# Impact note — Catalog, mã học viên và đơn 0đ (2026-11-19)

| Vùng | Tác động |
| --- | --- |
| Chức năng | Video hướng dẫn, giá theo thời điểm, mã ưu đãi sau chiết khấu và quà tặng đều do admin cấu hình. |
| API/DB | Thêm `/api/sales-config`, cấu hình admin qua sales-orders, migration `20261119170000_sales_catalog_promotions_and_zero_orders.sql`. |
| Phân quyền | Không thêm role: admin cấu hình; `operator`/`manager` chỉ xác minh đơn 0đ đã được phân công, kiểm tra server-side và audit. |
| UI/Tích hợp | `/sales` đọc giá/video từ server; đơn 0đ không gọi SePay. Không đổi domain, SePay hay cron. |
