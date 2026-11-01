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
- `content_categories` là cấp 1; `content_groups` là nhóm cấp 2, có thể gắn `category_id`.

## Định danh và quan hệ quan trọng

- `pages.id`: Meta Page ID, khóa ngoại nghiệp vụ bên ngoài.
- `pages.registry_id`: UUID nội bộ bất biến trong vòng đời Page.
- `page_connection_history`: một Page có thể xuất hiện qua nhiều connection/BM; không xóa lịch sử khi connection thay đổi.
- `page_group_assignments`: quan hệ nhiều-nhiều Page ↔ nhóm cấp 2.
- `page_assignments`: gán người, vai trò, chủ đề và tuyến quản lý.
- `page_payment_profiles`: quan hệ nhiều-nhiều Page ↔ hồ sơ thanh toán.
- `page_commissions`: lịch sử tỷ lệ chia sẻ theo người và thời gian hiệu lực.

## Kế hoạch dữ liệu bài viết và tương tác

`posts` hiện là registry nội dung, còn lịch sử số liệu bài viết và yêu cầu làm mới vẫn là **Roadmap**. Thiết kế mục tiêu gồm `post_publications`, `post_metric_snapshots` và `post_sync_requests`; không ghi đè snapshot cũ và không coi thiếu quyền là giá trị 0. Chi tiết và thứ tự triển khai xem [implementation-plan.md](implementation-plan.md).

Migration `20261101110000_post_observation_foundation.sql` đã tạo ba bảng này với RLS bật. API tạo yêu cầu và ghi provenance đã có; worker xử lý `post_sync_requests` và ghi `post_metric_snapshots` vẫn là bước tiếp theo, chưa tự động chạy production.

Migration `20261101120000_post_sync_worker.sql` bổ sung `post_sync_attempts` và RPC `claim_post_sync_requests`; worker vẫn tắt mặc định bằng `ENABLE_POST_SYNC_WORKER`.

Migration `20261101130000_community_post_identity.sql` cho phép `posts.page_id` rỗng đối với bài chỉ tồn tại trong cộng đồng, đồng thời lưu `origin_type`, group nguồn, URL ngoài và nguồn ingest. Bản ghi cộng đồng không được suy diễn là bài của Page.

## Bảng snapshot và phần worker còn hiệu lực trong roadmap

- `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` đã có migration control-plane; dispatcher/worker chưa bật production.
- `page_daily_snapshots`
- `post_daily_snapshots`
- `revenue_daily_snapshots`
- `admin_audit_logs` đã có migration; các endpoint quản trị cần bổ sung ghi audit đầy đủ.

Các bảng snapshot vẫn là phần cần bổ sung. Queue/audit đã tồn tại ở mức control-plane nhưng phần tích hợp snapshot/audit nghiệp vụ vẫn còn trong roadmap.

Migration `20261101090000_sync_orchestration_foundation.sql` đã được apply production và tạo control-plane tối thiểu gồm `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` và `admin_audit_logs`; migration `20261101100000_sync_job_claim_rpc.sql` bổ sung RPC nhận job nguyên tử. Cả 5 bảng đã được xác minh bật RLS. Worker/dispatcher vẫn mặc định tắt theo feature flag sau khi kiểm tra rollback.

## Quy tắc migration

- Migration chỉ thêm mới hoặc chuyển đổi an toàn.
- Không sửa file migration đã chạy production.
- Mọi bảng mới phải có khóa, index, status và timestamp.
- RLS phải được bật; API service role không được trở thành lý do bỏ qua kiểm tra quyền.
- Khi mở Data API cho client phải thêm grant và policy có điều kiện theo `auth.uid()`; không dùng `TO authenticated` đơn độc.
- Trước migration lớn phải backup và có rollback note.

