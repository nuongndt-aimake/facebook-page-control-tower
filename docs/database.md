# Database và migration

## Nhóm bảng hiện có

- Tài sản: `pages`, `businesses`, `meta_connections`, `page_connection_history`.
- Nội dung: `posts`, `metrics`.
- Đồng bộ: `sync_runs`.
- Người dùng: `profiles`, `page_access`, `page_assignments`, `team_memberships`.
- Nhóm: `content_categories`, `content_groups`, `page_group_assignments`.
- Tài chính: `payment_profiles`, `page_payment_profiles`, `payment_profile_access`, `revenue_entries`, `page_commissions`.

## Bảng nghiệp vụ bổ sung đã có trong migration

- `deals`, `access_requests`, `handover_audit` phục vụ bán/chuyển giao Page.
- `payment_profile_managers` phục vụ người Facebook đang quản lý hồ sơ payout.
- `team_memberships` phục vụ tuyến trên/tuyến dưới và nhóm vận hành.
- `user_reporting_lines` là quan hệ quản lý–nhân viên độc lập với nhóm nội dung; mỗi nhân viên có tối đa một quản lý active.
- `content_categories` là cấp 1; `content_groups` là nhóm cấp 2, có thể gắn `category_id`.

## Định danh và quan hệ quan trọng

- `pages.id`: Meta Page ID, khóa ngoại nghiệp vụ bên ngoài.
- `pages.registry_id`: UUID nội bộ bất biến trong vòng đời Page.
- `page_connection_history`: một Page có thể xuất hiện qua nhiều connection/BM; không xóa lịch sử khi connection thay đổi.
- `page_group_assignments`: quan hệ nhiều-nhiều Page ↔ nhóm cấp 2.
- `page_assignments`: gán người, vai trò, chủ đề và tuyến quản lý.
- `page_payment_profiles`: quan hệ nhiều-nhiều Page ↔ hồ sơ thanh toán.
- `page_commissions`: lịch sử tỷ lệ chia sẻ theo người và thời gian hiệu lực.

Quy tắc kế thừa quản lý: `team_memberships.parent_user_id` xác định tuyến trên/tuyến dưới. Khi người dùng đăng nhập, hệ thống tính toàn bộ cây người dùng đang active; Page và hồ sơ payout được gán cho tuyến dưới được đưa vào phạm vi báo cáo của tuyến trên. API báo cáo giữ provenance `direct`, `inherited` hoặc `direct_and_inherited` để không trộn lẫn quyền gán trực tiếp với quyền kế thừa.

## Kế hoạch dữ liệu bài viết và tương tác

`posts` hiện là registry nội dung, còn lịch sử số liệu bài viết và yêu cầu làm mới vẫn là **Roadmap**. Thiết kế mục tiêu gồm `post_publications`, `post_metric_snapshots` và `post_sync_requests`; không ghi đè snapshot cũ và không coi thiếu quyền là giá trị 0. Chi tiết và thứ tự triển khai xem [implementation-plan.md](implementation-plan.md).

Migration `20261101110000_post_observation_foundation.sql` đã tạo ba bảng này với RLS bật. API tạo yêu cầu và ghi provenance đã có; worker xử lý `post_sync_requests` và ghi `post_metric_snapshots` được bật có điều kiện bằng `ENABLE_POST_SYNC_WORKER`.

Migration `20261101120000_post_sync_worker.sql` bổ sung `post_sync_attempts` và RPC `claim_post_sync_requests`; production hiện bật worker qua `ENABLE_POST_SYNC_WORKER=true`. Cờ vẫn được giữ để rollback an toàn.

Migration `20261101130000_community_post_identity.sql` cho phép `posts.page_id` rỗng đối với bài chỉ tồn tại trong cộng đồng, đồng thời lưu `origin_type`, group nguồn, URL ngoài và nguồn ingest. Bản ghi cộng đồng không được suy diễn là bài của Page.

Migration `20261101140000_publication_actor_provenance.sql` bổ sung `publisher_page_id`, `publisher_page_name`, `editor_user_id` và `published_as`. Quan hệ chuẩn là: tài khoản biên tập viên → Page phát hành → cộng đồng đích → bài viết.

## Bảng snapshot và phần worker còn hiệu lực trong roadmap

- `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` đã có migration control-plane; production hiện bật dispatcher qua `ENABLE_SYNC_ORCHESTRATOR=true`. Slot inactive được bỏ qua, không tự tạo hàng loạt job.
- `page_daily_snapshots`
- `post_daily_snapshots`
- `revenue_daily_snapshots`

`page_daily_snapshots` là nguồn trạng thái theo Page và theo ngày quan sát: lưu cửa sổ dữ liệu, `status`, số bài, metric outcomes và `observed_at`. `metrics` lưu các dòng metric có khóa chống trùng; `sync_runs` lưu kết quả cấp phiên; `sync_jobs`/`sync_attempts` lưu hàng đợi và từng lần thử. Báo cáo phải chọn snapshot mới nhất nằm trong đúng chu kỳ đang lọc, không lấy một phiên đồng bộ của chu kỳ khác để đại diện.
- `admin_audit_logs` đã có migration; các endpoint quản trị cần bổ sung ghi audit đầy đủ.

Migration `20261101150000_daily_snapshot_foundation.sql` đã được apply production. Ba bảng snapshot có RLS bật, khóa duy nhất theo Page/bài/ngày và lưu trạng thái `ok`, `empty`, `permission_error` hoặc `not_available`; pilot Page `1217277164808495` đã ghi được snapshot Page với 4 metric rows và không có request lỗi. Ba slot `06:00`, `14:00`, `22:00` đã được seed nhưng đang `inactive` để không bật đồng bộ hàng loạt ngoài ý muốn.

Phần worker/dispatcher đã được mở có kiểm soát trong production; các slot vẫn do quản trị viên bật/tắt riêng. Khi một slot chạy, job được tạo idempotent vào `sync_jobs`, claim theo concurrency, ghi `sync_attempts` và snapshot chỉ được cập nhật khi request thành công.

Migration `20261101090000_sync_orchestration_foundation.sql` đã được apply production và tạo control-plane tối thiểu gồm `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` và `admin_audit_logs`; migration `20261101100000_sync_job_claim_rpc.sql` bổ sung RPC nhận job nguyên tử. Cả 5 bảng đã được xác minh bật RLS. Worker/dispatcher vẫn mặc định tắt theo feature flag sau khi kiểm tra rollback.

## Quy tắc migration

- Migration chỉ thêm mới hoặc chuyển đổi an toàn.
- Không sửa file migration đã chạy production.
- Mọi bảng mới phải có khóa, index, status và timestamp.
- RLS phải được bật; API service role không được trở thành lý do bỏ qua kiểm tra quyền.
- Khi mở Data API cho client phải thêm grant và policy có điều kiện theo `auth.uid()`; không dùng `TO authenticated` đơn độc.
- Trước migration lớn phải backup và có rollback note.

