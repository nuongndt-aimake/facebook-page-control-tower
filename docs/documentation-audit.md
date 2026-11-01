# Audit tài liệu và kiến trúc — 2026-11-01

## Phạm vi kiểm tra

- Mã nguồn `api/`, HTML/JS và `vercel.json`.
- `supabase/schema.sql` và toàn bộ migration.
- README, cấu hình, Meta/BM, báo cáo, quyền, runbook và roadmap.
- Đối chiếu nền tảng với [Meta Graph API](https://developers.facebook.com/docs/graph-api/), [Supabase Auth](https://supabase.com/docs/guides/auth) và [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## Kết luận

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
| Trung bình | Daily snapshot/queue/attempt/lock chưa có bảng | Đã phân loại là roadmap, không mô tả là schema hiện hữu |
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

### Bảng chưa hoàn thiện chức năng

`page_daily_snapshots`, `post_daily_snapshots`, `revenue_daily_snapshots`; các bảng `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks`, `admin_audit_logs` và RPC claim đã có migration. Dispatcher vẫn bị khóa mặc định.

## Kiểm thử đã thực hiện

- `node --check` cho toàn bộ `.mjs` trong `api/` và runtime JS: đạt.
- Kiểm tra liên kết Markdown nội bộ: đạt.
- Kiểm tra `git diff --check`: đạt.
- Đối chiếu cron hiện tại: `0 1 * * *`, timezone UTC theo Vercel.

## Việc cần làm tiếp theo

1. Tách token Meta khỏi plaintext DB.
2. Tạo queue/attempt/lock và idempotency.
3. Thêm daily snapshot và audit log.
4. Triển khai admin preview read-only có audit.
5. Quyết định dùng Supabase session cho toàn bộ admin endpoint hay duy trì legacy admin key có giới hạn.
6. Chỉ bật ba slot đồng bộ khi plan Vercel và cơ chế lock đáp ứng.
