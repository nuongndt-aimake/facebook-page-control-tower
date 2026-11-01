# Triển khai Meta Control Tower trên Vercel + Supabase

Đây là tài liệu cài đặt legacy cho công cụ trong `api/`. Luồng hiện hành dùng Google/Supabase Auth, `analytics.html` và access context; `dashboard.html`/`DASHBOARD_ADMIN_KEY` chỉ giữ để tương thích, không dùng làm luồng người dùng chính. **Token Meta chỉ có trong Vercel Environment Variables**, không lưu Supabase và không đưa xuống trình duyệt.

## 1. Tạo database

Tạo một Supabase project, mở SQL Editor, dán và chạy toàn bộ [`supabase/schema.sql`](supabase/schema.sql). Sao chép Project URL và `service_role` key (Settings → API). Không dùng `anon` key ở server.

## 2. Đưa project lên Vercel

Import repository này vào Vercel. Trong Project Settings → Environment Variables, thêm cho Production (và Preview nếu cần):

| Key | Giá trị |
|---|---|
| `SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key Supabase |
| `DASHBOARD_ADMIN_KEY` | một mật khẩu dài, ngẫu nhiên, chỉ bạn biết |
| `CRON_SECRET` | chuỗi ngẫu nhiên khác `DASHBOARD_ADMIN_KEY` |
| `META_CONNECTIONS_JSON` | JSON danh sách kết nối dưới đây |
| `META_PAGE_METRICS` | tùy chọn, danh sách metrics cấp Page cách nhau bằng dấu phẩy |
| `META_POST_METRICS` | tùy chọn, danh sách metrics cấp bài viết cách nhau bằng dấu phẩy |

Ví dụ `META_CONNECTIONS_JSON` cho nhiều tài khoản Facebook/App (một dòng JSON):

```json
[{"label":"BM chính","user_access_token":"EA...","business_ids":["123456789"]},{"label":"Tài khoản phụ","user_access_token":"EA...","page_ids":["987654321"]}]
```

Mỗi token nên là long-lived User Access Token, do người có task `ANALYZE` trên Page cấp; app/token cần `pages_show_list`, `pages_read_engagement`, `read_insights`. Tool mặc định phát hiện qua `/me/accounts`. Nếu Page trong BM không xuất hiện ở đó, thêm `business_ids` (và quyền `business_management`) hoặc thêm thẳng `page_ids` vào đúng connection; tool sẽ thử lấy Page token thông qua tài khoản quản trị. Đây là phương án fallback, không phải lưu token Page trong database.

Deploy xong, mở `https://ten-project.vercel.app/analytics` và đăng nhập bằng Google/Supabase. Chỉ dùng `/dashboard` với `DASHBOARD_ADMIN_KEY` khi kiểm tra endpoint legacy.

## 3. Đồng bộ và cron

`vercel.json` hiện đặt cron `0 1 * * *` UTC (08:00 giờ Việt Nam). Các slot 06:00/14:00/22:00 trong Database đang inactive và chưa bật đồng bộ hàng loạt.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://ten-project.vercel.app/api/cron/sync
```

Hoặc thêm `?since=2026-09-20&until=2026-09-24` để backfill. Gói Vercel có thể giới hạn cron/function duration; nếu số Page/bài lớn, chia theo Page hoặc dùng Supabase Edge Function/queue cho job dài.

## Giới hạn quan trọng

- Đây là dữ liệu organic của **Facebook Page**, không phải tool scrape profile.
- Chỉ số/metric Meta thay đổi theo API version và loại Page. Tool gọi từng metric riêng, ghi warning thay vì dừng toàn job khi một metric không hợp lệ.
- Chỉ số doanh thu từ Content Monetization, Stars… không có endpoint Page API công khai ổn định để đồng bộ tổng quát. Professional Dashboard/Business Suite vẫn là nguồn đối soát doanh thu.
- Sau khi token Meta hết hạn hoặc quyền thay đổi, thay token ở Vercel rồi redeploy. Không nhập token hoặc Supabase service-role key vào giao diện dashboard.
