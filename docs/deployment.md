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

## Release gần nhất

- Migration: `20261101090000_sync_orchestration_foundation.sql`
- Trạng thái: đã apply Supabase production và xác minh 5 bảng/RLS.
- Code commit: `08cc446a47c544e9b5ed2fe2ae663c86245fcf8c`
- Worker/dispatcher: chưa bật production; chỉ mới triển khai control-plane.

