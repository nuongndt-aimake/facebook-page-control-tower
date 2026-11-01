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

- Migration: `20261101090000_sync_orchestration_foundation.sql`
- Trạng thái: đã apply Supabase production và xác minh 5 bảng/RLS.
- Code commit: `90f73fe` (`feat: add guarded sync job dispatcher`)
- Migration RPC: `20261101100000_sync_job_claim_rpc.sql`.
- Worker/dispatcher: đã có code; pilot 5 Page đạt, nhưng chưa bật production hàng loạt.

