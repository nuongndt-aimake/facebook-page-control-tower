# Audit tài liệu và kiến trúc — 2026-11-01

## Phạm vi kiểm tra

- Mã nguồn `api/`, HTML/JS và `vercel.json`.
- `supabase/schema.sql` và toàn bộ migration.
- README, cấu hình, Meta/BM, báo cáo, quyền, runbook và roadmap.
- Đối chiếu nền tảng với [Meta Graph API](https://developers.facebook.com/docs/graph-api/), [Supabase Auth](https://supabase.com/docs/guides/auth) và [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## Kết luận

Đối chiếu production lần cuối: alias production đang chạy commit `5fa8d02` ở trạng thái `READY`; `HEAD` và `origin/main` cùng commit này. Vì vậy các thay đổi gần đây về module map, navigator hai lớp, responsive submenu, `/team` một-nhiều và bulk actions đã được phát hành; không có commit tính năng bị bỏ lại ngoài production.

Tài liệu đủ để onboarding và vận hành phiên bản hiện tại nếu phân biệt ba lớp:

1. **Đã chạy:** HTML/JS, Vercel Functions, Supabase REST, Meta OAuth, registry Page/BM, access context và sync hiện tại.
2. **Tương thích/legacy:** `/api/report` dùng `DASHBOARD_ADMIN_KEY`, `META_USER_ACCESS_TOKEN` trong `.env.meta.example`.
3. **Roadmap:** ba slot active, mã hóa token và kiểm thử admin preview nhiều tầng. Snapshot daily và admin preview read-only đã có; control-plane tables và RPC claim đã có; dispatcher/attempt logging chạy có điều kiện khi bật `ENABLE_SYNC_ORCHESTRATOR` và vẫn cần pilot production.

## Phát hiện và xử lý

| Mức | Phát hiện | Xử lý |
| --- | --- | --- |
| Cao | Tên biến callback tài liệu không khớp code (`META_REDIRECT_URI` vs `META_OAUTH_REDIRECT_URI`) | Đã sửa trong `configuration.md` và `installation.md` |
| Cao | `/api/report` không dùng Supabase session | Đã sửa API reference thành `DASHBOARD_ADMIN_KEY` |
| Cao | `handover_user` từng được mô tả như API có sẵn | Đã đánh dấu roadmap; bàn giao deal hiện dùng `/api/admin/handover` |
| Cao | Admin preview cần kiểm thử nhiều tầng membership thực tế | Endpoint read-only, token hết hạn và audit đã có; tiếp tục pilot dữ liệu thật |
| Cao | Token Meta còn được lưu ở `meta_connections.user_access_token` | Đã ghi rõ rủi ro và đưa encryption/secret store vào P0 |
| Trung bình | Ba slot 06:00/14:00/22:00 chưa tương thích cron Hobby và `vercel.json` hiện chỉ có một cron/ngày | Đã ghi rõ hiện trạng và điều kiện triển khai |
| Trung bình | Ba slot lịch vẫn inactive và dispatcher chưa mở hàng loạt | Snapshot/queue/attempt/lock đã có migration; chỉ bật từng slot sau pilot và kiểm tra quota |
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

`page_daily_snapshots`, `post_daily_snapshots`, `revenue_daily_snapshots`, `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks`, `admin_audit_logs` và RPC claim đã có migration. Dispatcher và cả ba slot lịch vẫn bị khóa mặc định.

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
- `/team` đã có bulk `set_reporting_lines`/`end_reporting_lines`, nhưng việc nghiệm thu quyền kế thừa vẫn cần pilot bằng dữ liệu người dùng thực tế.
- Không đánh dấu các hạng mục này là Roadmap nữa; chỉ phần pilot, token hardening, dispatcher nhiều slot và post metric snapshots vẫn là Roadmap/Thử nghiệm.

## Xung đột đã rà soát trong đợt 2026-11-01

- API báo cáo đã chấp nhận đủ các kỳ `day`, `7d`, `28d`, `60d`, `90d`, `365d`, `this_month` và `last_month`; thông báo lỗi cũ đã được sửa để không mâu thuẫn với bộ chọn giao diện.
- Preview read-only được chặn ở các endpoint tạo yêu cầu/lưu bài viết và thao tác admin; token preview không còn mở đường ghi dữ liệu.
- Báo cáo người dùng bị giới hạn không còn trả nguyên cảnh báo và số liệu sync toàn nền tảng; metadata sync được lọc theo Page trong access context.
- README cài đặt cũ được đánh dấu legacy và đồng nhất với cron thực tế `0 1 * * *` UTC; hướng dẫn chính thức vẫn là migration theo timestamp và Google/Supabase Auth.
