# Audit tài liệu và kiến trúc — 2026-11-01

## Phạm vi kiểm tra

- Mã nguồn `api/`, HTML/JS và `vercel.json`.
- `supabase/schema.sql` và toàn bộ migration.
- README, cấu hình, Meta/BM, báo cáo, quyền, runbook và roadmap.
- Đối chiếu nền tảng với [Meta Graph API](https://developers.facebook.com/docs/graph-api/), [Supabase Auth](https://supabase.com/docs/guides/auth) và [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## Kết luận

Đối chiếu production lần cuối: các thay đổi menu và scheduler đã được push lên `origin/main` tại commit `e210126`; deployment production gần nhất dùng inspect URL `https://vercel.com/aimake/facebook-page-control-tower/8hysrrnL2XJyJTosJJgtPGNa9eHS`. Tài nguyên production đã kiểm tra có cache-bust menu `20261102-6`. Trạng thái READY đầy đủ cần tiếp tục xác nhận trong Vercel dashboard khi mạng/API ổn định.

Tài liệu đủ để onboarding và vận hành phiên bản hiện tại nếu phân biệt ba lớp:

1. **Đã chạy:** HTML/JS, Vercel Functions, Supabase REST, Meta OAuth, registry Page/BM, access context và sync hiện tại.
2. **Tương thích/legacy:** `/api/report` dùng `DASHBOARD_ADMIN_KEY`, `META_USER_ACCESS_TOKEN` trong `.env.meta.example`.
3. **Roadmap:** bật rộng các slot theo tải thực tế, mã hóa token và kiểm thử admin preview nhiều tầng. Snapshot daily và admin preview read-only đã có; control-plane tables và RPC claim đã có; dispatcher/attempt logging đang chạy có điều kiện với cờ production, cần theo dõi queue và tỷ lệ lỗi.

## Phát hiện và xử lý

| Mức | Phát hiện | Xử lý |
| --- | --- | --- |
| Cao | Tên biến callback tài liệu không khớp code (`META_REDIRECT_URI` vs `META_OAUTH_REDIRECT_URI`) | Đã sửa trong `configuration.md` và `installation.md` |
| Cao | `/api/report` không dùng Supabase session | Đã sửa API reference thành `DASHBOARD_ADMIN_KEY` |
| Cao | `handover_user` từng được mô tả như API có sẵn | Đã thay bằng action `offboard_user` trong `/api/admin/access`; bàn giao successor và audit đã có |
| Cao | Admin preview cần kiểm thử nhiều tầng membership thực tế | Endpoint read-only, token hết hạn và audit đã có; tiếp tục pilot dữ liệu thật |
| Cao | Token Meta còn được lưu ở `meta_connections.user_access_token` | Đã ghi rõ rủi ro và đưa encryption/secret store vào P0 |
| Trung bình | Cron Hobby có độ trễ trong phạm vi một giờ | Đã cấu hình ba cron một lần/ngày theo UTC tương ứng 06:00/14:00/22:00 Việt Nam; mỗi slot vẫn tôn trọng `active` và `periods` |
| Trung bình | Hàng chờ cần giới hạn theo concurrency/quota | Dispatcher đọc `max_concurrency`, claim nguyên tử và ghi attempt; cần theo dõi `sync_jobs`/`sync_attempts` sau khi bật slot thật |
| Thấp | `META_USER_ACCESS_TOKEN` còn trong file mẫu legacy | Đã ghi chú để không dùng nhầm cho Vercel production |

## Đối chiếu cấu trúc

### API đã có

- Auth/profile: `/api/auth/profile`.
- Meta OAuth: `/api/meta/start`, `/api/meta/callback`.
- Báo cáo: `/api/analytics`, `/api/report`.
- Admin: `/api/admin/access`, `revenue`, `deals`, `handover`, `send-bm-invite`.
- Cron: `/api/cron/sync`.

### Bảng đã có

`pages`, `posts`, `metrics`, `sync_runs`, `businesses`, `meta_connections`, `page_connection_history`, `profiles`, `page_access`, `page_assignments`, `content_categories`, `content_groups`, `page_group_assignments`, `team_memberships`, `payment_profiles`, `page_payment_profiles`, `payment_profile_access`, `payment_profile_managers`, `revenue_entries`, `page_commissions`, `deals`, `access_requests`, `handover_audit`.

### Bảng đã có nhưng còn giới hạn vận hành

`page_daily_snapshots`, `post_daily_snapshots`, `revenue_daily_snapshots`, `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks`, `admin_audit_logs` và RPC claim đã có migration. Ba cron gọi dispatcher theo slot; slot nào inactive sẽ không tạo/claim job.

## Kiểm thử đã thực hiện

- `node --check` cho toàn bộ `.mjs` trong `api/` và runtime JS: đạt.
- Kiểm tra liên kết Markdown nội bộ: đạt.
- Kiểm tra `git diff --check`: đạt.
- Đối chiếu cron hiện tại: `0 1 * * *`, timezone UTC theo Vercel.

## Việc cần làm tiếp theo

1. Tách token Meta khỏi plaintext DB.
2. Pilot admin preview với membership nhiều tầng và kiểm tra banner/thoát trên mọi route.
3. Bật từng slot đồng bộ sau khi kiểm tra plan Vercel, lock, quota và rollback.
4. Quyết định lộ trình loại bỏ các endpoint legacy dùng `DASHBOARD_ADMIN_KEY`.

### Bổ sung sau audit production

- `auth-nav.js` là nguồn điều hướng chuẩn; menu con không còn trải phẳng trên thanh ngang và CSS đã có cache-bust tương ứng.
- Admin preview đã được harden ở màn hình `/users`: nút xem trước gắn trực tiếp `user_id`/email vào từng dòng, không còn phụ thuộc vào việc phân tích text của hàng; token được lưu ở session storage và cookie, banner thoát hoạt động trên mọi route.
- Phạm vi tổng hợp báo cáo đã chuẩn hóa `page_id` từ `page_access`/`page_assignments` về chuỗi ngay tại access context; tránh lệch kiểu string/number làm Page được gán bị loại khỏi tổng views, bài, tương tác hoặc doanh thu.
- Chuỗi biểu đồ báo cáo dùng cùng múi giờ `Asia/Ho_Chi_Minh` với bộ lọc kỳ; đồng thời bỏ qua phản hồi tải cũ khi người dùng đổi kỳ liên tiếp, tránh KPI của kỳ mới đi cùng biểu đồ của kỳ trước.
- Manual/page sync và daily snapshot dùng cùng ngày nghiệp vụ `Asia/Ho_Chi_Minh`; tránh trường hợp nút “Hôm nay” chạy theo UTC rồi bài viết mới bị ghi vào ngày hôm qua.
- `/team` đã có bulk `set_reporting_lines`/`end_reporting_lines`; `offboard_user` chuyển tuyến và ghi audit, nhưng quyền kế thừa vẫn cần pilot bằng dữ liệu người dùng thực tế.
- Không đánh dấu các hạng mục này là Roadmap nữa; chỉ phần pilot, token hardening, dispatcher nhiều slot và post metric snapshots vẫn là Roadmap/Thử nghiệm.

## Xung đột đã rà soát trong đợt 2026-11-01

- API báo cáo đã chấp nhận đủ các kỳ `day`, `7d`, `28d`, `60d`, `90d`, `365d`, `this_month` và `last_month`; thông báo lỗi cũ đã được sửa để không mâu thuẫn với bộ chọn giao diện.
- Preview read-only được chặn ở các endpoint tạo yêu cầu/lưu bài viết và thao tác admin; token preview không còn mở đường ghi dữ liệu.
- Báo cáo người dùng bị giới hạn không còn trả nguyên cảnh báo và số liệu sync toàn nền tảng; metadata sync được lọc theo Page trong access context.
- README cài đặt cũ được đánh dấu legacy và đồng nhất với cron thực tế `0 1 * * *` UTC; hướng dẫn chính thức vẫn là migration theo timestamp và Google/Supabase Auth.
