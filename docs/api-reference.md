# API reference

API chạy dưới Vercel Functions trong thư mục `api/`. Các endpoint dùng JSON và trả lỗi theo dạng `{ "error": "..." }`.

## Kiểu xác thực

### Người dùng đã đăng nhập

Các endpoint quản trị dữ liệu dùng access token Supabase trong header:

```http
Authorization: Bearer <supabase_access_token>
```

Token được kiểm tra qua `auth/v1/user`, sau đó server đọc `profiles`, `page_access`, `page_assignments`, `team_memberships` và `payment_profile_access` để dựng access context.

### Tác vụ admin/cron

Các endpoint legacy hoặc tác vụ nội bộ dùng một trong hai header:

```http
X-Admin-Key: <DASHBOARD_ADMIN_KEY>
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` chỉ hợp lệ khi endpoint cho phép cron. Không đưa hai giá trị này vào JavaScript phía trình duyệt.

## Danh mục endpoint

| Endpoint | Phương thức | Mục đích | Quyền chính |
| --- | --- | --- | --- |
| `/api/auth/profile` | `GET` | Hồ sơ và access context của tài khoản | Supabase session |
| `/api/admin/preview` | `POST` | Tạo phiên xem trước access context của user, read-only, hết hạn 15 phút | `platform_admin`/`super_admin` |
| `/api/analytics` | `GET` | Snapshot báo cáo đã lưu | Supabase session hoặc cấu hình tương thích hiện hữu |
| `/api/report` | `GET` | Registry Page, bài đăng và lần sync mới nhất | `DASHBOARD_ADMIN_KEY` |
| `/api/meta/start` | `GET` | Tạo URL Meta OAuth | Supabase session |
| `/api/meta/callback` | `GET` | Đổi OAuth code, lưu connection và redirect | OAuth state |
| `/api/admin/access` | `GET` | Đọc Page/BM/user/assignment/group/payout/commission và trạng thái sync gần nhất (`schedule_slots`, `sync_jobs`, `sync_runs`) | `platform_admin`/`super_admin` |
| `/api/admin/access` | `POST` | Sync, gán Page, nhóm, nhân sự, payout, hoa hồng | Theo action và role |
| `/api/admin/access` | `POST` `set_reporting_line` / `end_reporting_line` | Gán hoặc kết thúc một quan hệ quản lý–nhân viên độc lập với nhóm nội dung | `platform_admin`/`super_admin` |
| `/api/admin/access` | `POST` `set_reporting_lines` / `end_reporting_lines` | Gán hoặc kết thúc nhiều nhân viên cho một quản lý trong một thao tác; mỗi nhân viên vẫn chỉ có một quản lý active | `platform_admin`/`super_admin` |
| `/api/admin/revenue` | `GET/POST` | Đọc/ghi khoản doanh thu manual | Admin |
| `/api/admin/deals` | `GET/POST` | Quản lý deal và yêu cầu truy cập | Admin |
| `/api/admin/handover` | `POST` | Bàn giao tài sản/người phụ trách | Admin |
| `/api/admin/send-bm-invite` | `POST` | Gửi lời mời Business | Admin |
| `/api/cron/sync` | `GET/POST` | Chạy đồng bộ Meta theo phạm vi | `CRON_SECRET` hoặc admin |
| `/api/posts/sync-request` | `GET/POST` | Tạo hoặc xem yêu cầu làm mới chỉ số bài viết | Supabase session + Page access |
| `/api/posts/publication` | `POST` | Ghi nhận bài đăng ở Page/cộng đồng từ extension hoặc nhập thủ công | Supabase session + Page access |
| `/api/cron/post-sync` | `GET/POST` | Xử lý các yêu cầu làm mới chỉ số bài viết; rewrite vào module sync chung | `CRON_SECRET` hoặc admin, feature flag |
| `/api/public/application` | `GET` | Dữ liệu công khai cho landing/application | Công khai |

## Action chính của `/api/admin/access`

`POST` nhận JSON có `action`. Các action đang có trong code:

- `sync`: đồng bộ theo `period`: `day`, `7d`, `28d`, `60d`, `90d`, `365d`, `this_month`, `last_month`, hoặc `all`.
- `sync_page`: đồng bộ chủ động một Page với `page_id` và `period`; nếu không truyền, mặc định là chu kỳ `day`.
- `refresh_assets`: làm mới registry Page/BM và snapshot ngày hiện tại.
- `assign_page`: gán Page cho user/nhóm/chủ đề.
- `upsert_profile`, `link_page`, `unlink_page`, `set_manager`: quản lý payout profile.
- `create_category`, `update_category`, `delete_category`.
- `create_group`, `update_group`, `delete_group`, `assign_group`, `unassign_group`.
- `assign_page_access`, `assign_team`, `set_user_role`, `suspend_user`, `delete_user`.
- `set_commission`.
- `update_sync_slot`: cập nhật active/inactive, giờ địa phương, kỳ đồng bộ và concurrency cho một slot lịch; chỉ `platform_admin`/`super_admin`, có audit log.

Bàn giao deal dùng endpoint riêng `/api/admin/handover` với các action như `approve_request`, `task_granted`, `ready_for_handover` và `complete_outright_handover`. `handover_user` cho việc chuyển assignment nhân sự vẫn là hạng mục cần hoàn thiện, chưa phải API hiện hữu.

Mọi action mới phải được thêm vào bảng này, kiểm tra role ở server và ghi tài liệu request/response.

Khi `ENABLE_SYNC_ORCHESTRATOR=true`, `/api/cron/sync` hỗ trợ thêm query `period`, `slot`, `limit` và tùy chọn `page_id` để pilot một Page. Endpoint sẽ trả `queued`, `claimed`, `completed`, `failed`, `concurrency`, `pacing`, `warnings` và kết quả từng job. `limit` bị giới hạn 1–100 nhưng còn bị chặn bởi `sync_schedule_slots.max_concurrency` (vận hành 1–10); luồng cũ vẫn là mặc định khi cờ tắt.

`/api/admin/access` trả `sync_job_counts` là bộ đếm theo trạng thái trên toàn bộ job đọc được; `sync_jobs` chỉ là danh sách gần nhất để hiển thị chi tiết, không dùng làm nguồn đếm tổng. Thao tác `sync` trả thêm `selected_period`; `all` dùng cửa sổ 365 ngày. Thao tác `sync_page` trả `page_id` và chu kỳ đã thực thi.

`/api/analytics` trả `pages[].latest_snapshot` theo đúng khoảng `period` đang xem, gồm `status`, `window_start`, `window_end`, `snapshot_date`, `observed_at` và `posts_count`. `sync_warnings` là cảnh báo request/permission đã ghi nhận; không suy diễn trạng thái vi phạm chính sách khi Meta không cấp endpoint/quyền tương ứng.

API làm mới chỉ số bài viết (`post_sync_request`) và ingest bài đăng cộng đồng (`post_publications`) đã tích hợp vào `/api/analytics` qua rewrite/action; worker `/api/cron/post-sync` tích hợp vào `/api/cron/sync?worker=post`. Cả hai vẫn có feature flag và mặc định không tự chạy hàng loạt.

Với bài đăng cộng đồng, request phải phân biệt: `publisher_page_id` là Page đăng bài, `community_id`/`community_url` là nơi nhận bài, còn `editor_user_id` được lấy từ Supabase session của tài khoản biên tập viên. Không dùng `page_id` đơn độc để suy đoán cộng đồng đích.

## Ví dụ gọi sync

```bash
curl -X POST https://money.aiecom.vn/api/admin/access \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"sync","period":"7d"}'
```

Kết quả phải cho biết `since`, `until`, số Page, số bài, số metric, số request lỗi, cảnh báo và trạng thái từng Page. Không coi mảng rỗng là lỗi nếu request Meta thành công nhưng không có dữ liệu; phân biệt bằng `failed_requests`, `empty_requests` và `warnings`.

## Quy tắc API

1. Không trả access token Meta/Page token về browser.
2. Không gọi Graph API trực tiếp từ HTML/JS.
3. Dùng `encodeURIComponent` khi tạo PostgREST filter.
4. Các thao tác lặp phải idempotent bằng conflict key hoặc run/job key.
5. Lỗi quyền trả `401/403`; lỗi dữ liệu đầu vào trả `400`; lỗi upstream/database trả `500` kèm log server.
