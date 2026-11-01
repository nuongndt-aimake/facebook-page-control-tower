# Database và migration

## Nhóm bảng hiện có

- Tài sản: `pages`, `businesses`, `meta_connections`, `page_connection_history`.
- Nội dung: `posts`, `metrics`.
- Đồng bộ: `sync_runs`.
- Người dùng: `profiles`, `page_access`, `page_assignments`, `team_memberships`.
- Nhóm: `content_categories`, `content_groups`, `page_group_assignments`.
- Tài chính: `payment_profiles`, `page_payment_profiles`, `payment_profile_access`, `revenue_entries`, `page_commissions`.

## Bảng cần bổ sung theo roadmap

- `sync_schedule_slots`
- `sync_jobs`
- `sync_attempts`
- `sync_locks`
- `page_daily_snapshots`
- `post_daily_snapshots`
- `revenue_daily_snapshots`
- `admin_audit_logs`

## Quy tắc migration

- Migration chỉ thêm mới hoặc chuyển đổi an toàn.
- Không sửa file migration đã chạy production.
- Mọi bảng mới phải có khóa, index, status và timestamp.
- RLS phải được bật; API service role không được trở thành lý do bỏ qua kiểm tra quyền.
- Trước migration lớn phải backup và có rollback note.

