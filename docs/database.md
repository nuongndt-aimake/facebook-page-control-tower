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

## Bảng cần bổ sung theo roadmap/worker

- `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` đã có migration control-plane; dispatcher/worker chưa sử dụng production.
- `page_daily_snapshots`
- `post_daily_snapshots`
- `revenue_daily_snapshots`
- `admin_audit_logs` đã có migration; các endpoint quản trị cần bổ sung ghi audit đầy đủ.

Các bảng snapshot/queue/audit trong mục này là phần cần bổ sung để đáp ứng lịch đồng bộ ba slot và truy vết từng request; không được coi là đã tồn tại chỉ vì đã có trong roadmap.

Migration `20261101090000_sync_orchestration_foundation.sql` đã được apply production và tạo control-plane tối thiểu gồm `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks` và `admin_audit_logs`; cả 5 bảng đã được xác minh bật RLS. Worker/dispatcher vẫn phải bật theo feature flag sau khi kiểm tra rollback.

## Quy tắc migration

- Migration chỉ thêm mới hoặc chuyển đổi an toàn.
- Không sửa file migration đã chạy production.
- Mọi bảng mới phải có khóa, index, status và timestamp.
- RLS phải được bật; API service role không được trở thành lý do bỏ qua kiểm tra quyền.
- Khi mở Data API cho client phải thêm grant và policy có điều kiện theo `auth.uid()`; không dùng `TO authenticated` đơn độc.
- Trước migration lớn phải backup và có rollback note.

