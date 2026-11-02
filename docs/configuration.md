# Cấu hình môi trường

## Biến bắt buộc

| Biến | Dùng ở đâu | Ghi chú |
| --- | --- | --- |
| `SUPABASE_URL` | API server | URL project Supabase |
| `SUPABASE_PUBLISHABLE_KEY` hoặc `SUPABASE_ANON_KEY` | Kiểm tra Supabase Auth | Chỉ dùng để xác thực session; có thể xuất hiện ở client nếu cần |
| `SUPABASE_SERVICE_ROLE_KEY` | PostgREST server-side | Tuyệt đối không đưa xuống browser |
| `PLATFORM_ADMIN_EMAIL` | Bootstrap profile đầu tiên | Chuẩn hóa lowercase |
| `DASHBOARD_ADMIN_KEY` | Admin key tương thích/legacy | Luân phiên định kỳ |
| `CRON_SECRET` | Vercel cron | Không dùng làm user token |
| `ENABLE_SYNC_ORCHESTRATOR` | Queue dispatcher | Cron có `slot=slot_06/slot_14/slot_22` sẽ dùng dispatcher theo slot; bật `true` để cả các invocation thủ công không chỉ định slot dùng cùng cơ chế |
| `SYNC_DISPATCH_BATCH` | Queue dispatcher | Số job tối đa mỗi invocation, giới hạn 1–100; mặc định `1`, nên tăng thận trọng theo quota Meta/Vercel |
| `ENABLE_POST_SYNC_WORKER` | Post metric worker | `true` để cron `/api/cron/post-sync` nhận các yêu cầu cập nhật tương tác bài viết |
| `META_TOKEN_ENCRYPTION_KEY` | Meta token hardening | Base64 của đúng 32 byte; khi có, token OAuth mới được mã hóa AES-256-GCM trước khi lưu vào `meta_connections` |
| `SYNC_JOB_DELAY_MS` | Queue pacing | Delay tối thiểu giữa job trong cùng batch; mặc định `900`, server giới hạn 250–10000 ms |
| `SYNC_JOB_JITTER_MS` | Queue pacing | Jitter ngẫu nhiên để tránh nhịp gọi đều; mặc định `300`, server giới hạn 0–3000 ms |
| `ENABLE_POST_SYNC_WORKER` | Post metric worker | `false` mặc định; chỉ bật sau khi có request cụ thể và pilot |
| `POST_SYNC_BATCH` | Post metric worker | Số yêu cầu bài viết tối đa mỗi invocation; mặc định `1` |
| `META_APP_ID` | Meta OAuth | App ID |
| `META_APP_SECRET` | Meta OAuth callback | Chỉ server-side |
| `META_OAUTH_REDIRECT_URI` | Meta OAuth | Phải khớp tuyệt đối với Meta App; mặc định là `https://money.aiecom.vn/api/meta/callback` |
| `META_OAUTH_STATE_SECRET` | Ký OAuth state | Secret bắt buộc để chống CSRF/replay |
| `META_LOGIN_CONFIG_ID` | Meta Login for Business | Tùy chọn; nếu có thì code dùng `config_id` thay cho danh sách scope |
| `META_CONNECTIONS_JSON` | Fallback connection | Không dùng nếu connection đã lưu trong DB |
| `META_PAGE_METRICS` | Page insight metrics | Danh sách metric phân tách bằng dấu phẩy |
| `META_POST_METRICS` | Post insight metrics | Danh sách metric phân tách bằng dấu phẩy |
| `META_REPORT_VIEW_METRICS` | Chọn metric view ưu tiên khi dựng báo cáo | Tùy chọn |

## Tệp cục bộ

- `.env.meta.example`: mẫu biến Meta, được phép commit.
- `META_USER_ACCESS_TOKEN` trong `.env.meta.example` là biến legacy cho công cụ cũ; code Vercel hiện ưu tiên `META_CONNECTIONS_JSON` hoặc bảng `meta_connections`.
- `.env.local`, `.env.meta-temp`: chỉ máy local, không commit.
- Vercel Environment Variables phải tách theo `Development`, `Preview`, `Production`.

## Kiểm tra trước khi chạy

```powershell
if (-not $env:SUPABASE_URL) { throw 'Thiếu SUPABASE_URL' }
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { throw 'Thiếu SUPABASE_SERVICE_ROLE_KEY' }
```

## Lưu ý bảo mật hiện trạng

Migration hiện tại có cột `meta_connections.user_access_token`. Đây là dữ liệu nhạy cảm và **chưa được mã hóa/vault hóa trong schema hiện có**. Không sao chép giá trị này vào issue, log, snapshot hoặc response. Hạng mục hardening cần chuyển sang secret store/encryption at rest trước khi mở rộng nhiều admin.

## OAuth allowlist

Production hiện dùng:

- `https://money.aiecom.vn`
- `https://money.aiecom.vn/api/meta/callback`
- `https://money.aiecom.vn/auth/callback` nếu Supabase Auth dùng callback riêng

Mọi thay đổi domain phải cập nhật đồng thời Vercel, Meta App, Supabase Auth và Google OAuth.
