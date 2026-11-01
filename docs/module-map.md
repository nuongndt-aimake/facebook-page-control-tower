# Bản đồ module và ranh giới triển khai

## Nguyên tắc

Vercel phát hành toàn bộ project theo một deployment nguyên khối. Vì vậy module hóa không có nghĩa là mỗi màn hình tạo một Function riêng. Mỗi module phải có:

1. Ranh giới nghiệp vụ rõ ràng.
2. Ranh giới dữ liệu và quyền rõ ràng.
3. Một hoặc một nhóm Function ổn định.
4. Feature flag hoặc rewrite để có thể bật/tắt an toàn.
5. Smoke test độc lập trước khi gộp vào production.

## Các module hiện tại

| Module | Trách nhiệm | Function boundary | Dữ liệu chính | Phụ thuộc |
| --- | --- | --- | --- | --- |
| Identity & Access | Google session, profile, RBAC, admin preview, tuyến quản lý | `api/auth/profile`, `api/admin/access` | `profiles`, `team_memberships`, `user_reporting_lines`, `admin_audit_logs` | Supabase Auth |
| Asset Governance | BM, Page registry, gán Page, bàn giao, lời mời | `api/admin/access`, `api/admin/handover`, `api/admin/send-bm-invite` | `pages`, `businesses`, `page_access`, `page_assignments`, history tables | Meta connection, Identity |
| Commercial & Payout | Deal, doanh thu manual, payout profile, hoa hồng | `api/admin/deals`, `api/admin/revenue`, `api/admin/access` | `payment_profiles`, `page_payment_profiles`, `commissions`, deals | Identity, Asset Governance |
| Meta Connection | OAuth, connection health, Page/BM discovery | `api/meta/start`, `api/meta/callback` | `meta_connections`, `page_connection_history` | Meta App, Supabase Auth |
| Sync Orchestration | Scheduler, queue, claim, retry, Page/post worker | `api/cron/sync` | `sync_runs`, `sync_jobs`, `sync_attempts`, post request tables | Meta Connection, Supabase |
| Content & Post Metrics | Registry bài viết, provenance cộng đồng, yêu cầu refresh, snapshot tương tác | public URLs `/api/posts/*`, thực thi trong `api/analytics` và `api/cron/sync` | `posts`, `post_publications`, `post_sync_requests`, `post_sync_attempts`, `post_metric_snapshots`, `metrics` | Identity, Asset Governance, Sync |
| Reporting Read Model | Báo cáo Page, nội dung, doanh thu, payout, phân quyền kế thừa | `api/analytics`, `api/report` | snapshots, `metrics`, registry, payout tables | Tất cả module dữ liệu |
| Public Application | Landing, privacy, terms, application metadata | `api/public/application` + static HTML | Không có dữ liệu nhạy cảm | Không |

## Luồng dữ liệu chuẩn

```text
Auth/OAuth
  -> Connection & Asset Registry
  -> Sync Run
  -> Queue/Worker
  -> Raw result + metric + snapshot + attempt
  -> Reporting read model
  -> UI theo RBAC
```

Không cho UI gọi Meta trực tiếp. UI chỉ đọc read model hoặc tạo command có quyền; worker mới gọi Meta và ghi snapshot.

## Module điều hướng quản trị

Menu quản trị là một phần hạ tầng dùng chung, không phải cấu hình riêng của từng màn hình:

- `auth-nav.js` là nguồn cấu hình chuẩn cho toàn bộ màn hình đã xác thực.
- Thứ tự chuẩn: Tổng quan, Page, Nội dung, Doanh thu, Payout, Hoa hồng, Tài sản, Nhóm nội dung, Nhân sự, Tuyến quản lý, Kết nối Meta, Tài khoản.
- Mỗi mục chỉ có một URL chuẩn; màn hình cũ có thể giữ route tương thích nhưng không được tạo thêm mục menu trùng lặp.
- Menu desktop dùng thanh điều hướng cố định; menu mobile dùng cùng danh sách liên kết trong panel có `z-index` riêng, đóng khi chọn liên kết, bấm ngoài hoặc nhấn Escape.
- Các trang marketing công khai không dùng menu quản trị; chúng có luồng điều hướng công khai và nút đăng nhập riêng.
- Khi thêm route mới, phải bổ sung vào cấu hình menu, kiểm tra quyền RBAC, điểm neo từ một màn hình hiện có và test ở desktop/mobile trước khi phát hành.

Phiên bản cache-bust hiện tại của tài nguyên menu là `20261101-7`. Khi thay đổi hành vi menu, cập nhật phiên bản này trên các HTML admin và ghi lại trong changelog; không xóa các route cũ khỏi tài liệu, chỉ đánh dấu hết hiệu lực nếu đã được thay thế.

## Quy tắc Function boundary

- Không thêm Function mới chỉ vì tạo màn hình mới.
- Route public có thể giữ URL riêng nhưng phải rewrite vào module Function phù hợp.
- `api/admin/access` là command boundary quản trị.
- `api/analytics` là read/report boundary và command boundary cho post publication/request.
- `api/cron/sync` là worker boundary cho Page sync và post sync.
- Tối đa 12 Function production hiện tại; mọi thay đổi phải kiểm tra số Function sau `vercel build`.

## Quy trình triển khai không treo chức năng

### Bước 1 — Database trước

- Migration chỉ thêm bảng/cột/index/policy.
- Không đổi tên hoặc xóa cột trong cùng release với code mới.
- Kiểm tra RLS, Data API exposure và backfill riêng.

### Bước 2 — Code tương thích ngược

- Thêm read path trước.
- Thêm write/worker sau.
- Bao worker bằng feature flag mặc định `false`.
- Rewrite route cũ vào boundary mới nếu cần.

### Bước 3 — Kiểm thử theo module

- Syntax/import check.
- Unit smoke cho handler và access context.
- Kiểm tra migration/RLS trên Supabase production.
- Preview deployment và test 390px/desktop.

### Bước 4 — Phát hành

- Push `main` để Vercel tạo deployment.
- Chỉ coi là thành công khi `READY` và alias `money.aiecom.vn` trỏ đúng commit.
- Bật feature flag sau khi read path và queue đã kiểm tra.
- Nếu lỗi, tắt flag hoặc rollback deployment; không xóa migration/lịch sử.

## Khi nào cần tách thành nhiều Vercel project

Chỉ tách khi một trong các điều kiện xảy ra:

- Worker đồng bộ cần lịch chạy/scale độc lập.
- Reporting cần deploy độc lập khỏi admin UI.
- Vượt giới hạn Function hoặc thời gian chạy của project hiện tại.
- Cần cô lập secret, domain hoặc team vận hành.

Khi tách, giữ Supabase là data contract chung và dùng versioned API; không tách chỉ để tránh tổ chức code.
