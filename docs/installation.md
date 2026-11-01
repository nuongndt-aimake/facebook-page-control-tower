# Hướng dẫn cài đặt và kết nối hệ thống

Tài liệu này dành cho lập trình viên mới hoặc người triển khai môi trường mới. Quy trình chuẩn là:

```text
GitHub → Vercel → Supabase → Google OAuth
                         ↘ Meta App OAuth
DNS aiecom.vn → money.aiecom.vn → Vercel
```

## 1. Yêu cầu trước khi cài đặt

- Git và Node.js LTS.
- Tài khoản GitHub có quyền repository `nuongndt-aimake/facebook-page-control-tower`.
- Tài khoản Vercel có quyền project.
- Project Supabase đã tạo.
- Meta App đã tạo, có App ID/App Secret và người dùng quản trị Page/BM.
- Google OAuth client cho đăng nhập Supabase.
- Quyền quản lý DNS của `aiecom.vn`.

## 2. Lấy mã nguồn

```powershell
git clone https://github.com/nuongndt-aimake/facebook-page-control-tower.git
Set-Location facebook-page-control-tower
git checkout main
```

Không clone hoặc copy các file `.env` từ máy khác. Tạo `.env.local` từ `.env.meta.example` và điền thủ công.

## 3. Cài đặt local

Project hiện là HTML/JS tĩnh kết hợp Vercel Functions, không cần build framework riêng:

```powershell
npm install
node --check analytics-runtime.js
Get-ChildItem api -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
```

Có thể chạy local bằng Vercel CLI:

```powershell
npx vercel dev
```

Truy cập `http://localhost:3000`. Không dùng URL local làm callback production.

## 4. Cấu hình Supabase

1. Tạo project Supabase.
2. Mở SQL Editor hoặc dùng migration workflow đã được phê duyệt.
3. Chạy các file trong `supabase/migrations/` theo thứ tự timestamp.
4. Kiểm tra các bảng và RLS.
5. Bật Google provider trong Authentication → Providers.
6. Đặt Site URL là `https://money.aiecom.vn`.
7. Thêm callback Supabase:

```text
https://tlcjcqqnfjrqsoiaalfk.supabase.co/auth/v1/callback
```

8. Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào HTML hoặc biến `NEXT_PUBLIC_*`.

## 5. Cấu hình Google OAuth

Trong Google Cloud Console:

- Authorized JavaScript origins:
  - `https://money.aiecom.vn`
- Authorized redirect URI:
  - `https://tlcjcqqnfjrqsoiaalfk.supabase.co/auth/v1/callback`

Client ID/secret được nhập vào Supabase Auth Provider, không hard-code vào repository.

## 6. Cấu hình Meta OAuth

Trong Meta for Developers → App Settings → Basic:

- App Domains: `money.aiecom.vn`
- Privacy Policy URL: `https://money.aiecom.vn/privacy.html`
- Terms URL: `https://money.aiecom.vn/terms.html`
- Data Deletion URL: URL endpoint xóa dữ liệu đã triển khai, nếu App yêu cầu.

Trong Facebook Login/Web OAuth:

```text
https://money.aiecom.vn/api/meta/callback
```

Phải thêm đúng URL trên vào Valid OAuth Redirect URIs. Không dùng `facebook.aiecom.vn` sau khi đã chuyển sang tên miền `money.aiecom.vn`.

Scopes hiện dùng trong code:

```text
pages_show_list
pages_read_engagement
read_insights
business_management
```

Quyền được Meta cấp thực tế còn phụ thuộc App Mode, review và quyền của tài khoản đang authorize.

## 7. Cấu hình Vercel

### Import từ GitHub

1. Vercel → Add New Project → Import Git Repository.
2. Chọn `nuongndt-aimake/facebook-page-control-tower`.
3. Framework preset: `Other` hoặc static.
4. Root Directory: thư mục repository.
5. Build command: để trống nếu không có build step.
6. Output Directory: để trống.
7. Deploy.

### Environment Variables

Thêm các biến từ [configuration.md](configuration.md) cho cả môi trường cần dùng. Tối thiểu production cần:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
PLATFORM_ADMIN_EMAIL
DASHBOARD_ADMIN_KEY
CRON_SECRET
META_APP_ID
META_APP_SECRET
META_REDIRECT_URI=https://money.aiecom.vn/api/meta/callback
META_PAGE_METRICS
META_POST_METRICS
```

Sau khi đổi secret, redeploy production để Function nhận giá trị mới.

## 8. Trỏ tên miền `money.aiecom.vn`

Trong Vercel project → Settings → Domains, thêm:

```text
money.aiecom.vn
```

Vercel sẽ hiển thị giá trị DNS cần tạo. Với DNS quản lý tại Cloudflare hoặc nhà cung cấp khác, thông thường tạo:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `money` | giá trị Vercel cung cấp, thường là `cname.vercel-dns.com` | DNS only khi Vercel yêu cầu |

Không tự đoán target nếu Vercel hiển thị giá trị khác. Xóa record trùng `money`/`facebook` nếu gây conflict. Sau khi DNS propagate, kiểm tra:

```powershell
Resolve-DnsName money.aiecom.vn
```

Sau đó mở `https://money.aiecom.vn/privacy.html`, `/terms.html`, `/analytics` và `/api/meta/start`.

## 9. Kết nối các hệ thống

### GitHub ↔ Vercel

- Production branch: `main`.
- Pull request nên deploy Preview.
- Không dùng file local ngoài commit để cấu hình production.

### Vercel ↔ Supabase

- Vercel Function dùng service role để ghi dữ liệu server-side.
- Browser chỉ dùng Supabase session/access token.
- Nếu thay đổi schema, chạy migration trước khi deploy code phụ thuộc bảng mới.

### Vercel ↔ Meta

- Browser gọi `/api/meta/start`.
- Meta redirect về `/api/meta/callback`.
- Callback đổi code lấy token và lưu connection server-side.
- Cron/manual sync gọi Graph API từ Function, không từ browser.

### Vercel ↔ DNS/SSL

- DNS trỏ tới Vercel.
- SSL do Vercel cấp sau khi domain hợp lệ.
- Nếu dùng Cloudflare proxy, kiểm tra SSL mode và không tạo vòng lặp redirect.

## 10. Checklist nghiệm thu sau cài đặt

- [ ] `https://money.aiecom.vn` mở được.
- [ ] Privacy/Terms trả HTTP 200.
- [ ] Google login tạo session Supabase.
- [ ] `/api/auth/profile` trả profile đúng role.
- [ ] Meta OAuth không báo domain/redirect mismatch.
- [ ] Kết nối Page tạo được record trong `meta_connections`.
- [ ] Sync một Page tạo `pages`, `posts`, `metrics`, `sync_runs`.
- [ ] User không có quyền không xem được payout/Page ngoài assignment.
- [ ] Mobile menu hoạt động và không overlap.
- [ ] Vercel Function logs không có token hoặc secret.

## 11. Xử lý lỗi thường gặp

| Lỗi | Kiểm tra |
| --- | --- |
| Meta “URL domain not allowed” | App Domains và redirect URI phải dùng `money.aiecom.vn` |
| Google trả sai callback | Supabase Redirect URLs và Google redirect URI phải dùng callback Supabase |
| `401 Unauthorized` | Session còn hạn, header Bearer, publishable key |
| `403 Forbidden` | `profiles.role`, status, page/payout access và tuyến quản lý |
| DNS/SSL lỗi | CNAME, record trùng, Cloudflare proxy/SSL mode |
| Sync không có dữ liệu | Xem `sync_runs.summary`: phân biệt request error, empty success và not applicable |
| Vercel không đọc env | Chọn đúng Environment và redeploy |

## 12. Tắt hoặc khôi phục

- Tắt cron bằng cách disable slot/cron trước khi sửa code đồng bộ.
- Rollback Vercel về deployment trước đó, không xóa snapshot/database.
- Giữ domain production trỏ vào deployment đã kiểm chứng.
- Sau rollback, kiểm tra lại Auth callback và version migration.
