# Kế hoạch hành động tăng tốc triển khai

## Mục tiêu

Đưa hệ thống từ trạng thái hiện tại lên phiên bản vận hành ổn định cho 50 Page, có thể mở rộng, trong khi giảm thời gian chờ giữa các nhóm công việc.

## Nguyên tắc tăng tốc

- Chia theo workstream độc lập, giao đầu ra rõ ràng.
- Chỉ tuần tự hóa các phần có dependency thật: schema → API → UI → nghiệm thu.
- Dùng feature flag cho phần chưa hoàn thiện, không chặn toàn hệ thống.
- Mỗi workstream phải cập nhật tài liệu và có impact note.
- Không mở rộng sync hàng loạt trước khi token, queue, retry và dữ liệu lỗi được phân loại.

## Đường găng bắt buộc

```text
Schema/RLS + token hardening
          ↓
Sync run/job/attempt + registry
          ↓
API access/reporting
          ↓
UI báo cáo + quản trị + payout
          ↓
Pilot 5 Page → 20 Page → 50 Page
```

Các bước trên phải tuần tự ở phần tích hợp cuối, nhưng có thể chuẩn bị song song bằng mock/fixture.

## Workstream chạy song song

| Mã | Workstream | Có thể chạy song song với | Đầu ra |
| --- | --- | --- | --- |
| A | Database/RLS/token hardening | B, C, D, E | migration, policy, rollback note |
| B | Meta/BM discovery và sync engine | A sau khi chốt contract | registry, queue contract, retry/error model |
| C | API/access context/RBAC | A sau khi chốt schema | endpoint contract, permission matrix |
| D | UI shell/navigator/responsive | A, B, C bằng fixture | layout, mobile menu, table/card patterns |
| E | Báo cáo Page/nội dung/doanh thu | D, song song với B bằng mock | màn hình độc lập, period/filter contract |
| F | Payout/commission/user handover | A, C, D | màn hình và action phân quyền |
| G | Deployment/observability/runbook | Tất cả | env, logs, alert, rollback |
| H | Tài liệu/QA | Tất cả | docs, smoke, responsive, release checklist |

## Tuần tự tích hợp

### Giai đoạn 0 — Chốt contract và baseline

1. Đóng băng schema hiện trạng và xuất danh sách migration đã chạy.
2. Chốt API contract cho `accessContext`, `sync_runs`, Page registry và period.
3. Tạo fixture 5 Page: trong BM, ngoài BM, lỗi token, không có metric, có doanh thu.
4. Ghi trạng thái chức năng: `Đang dùng`, `Roadmap`, `Hết hiệu lực`.

**Điều kiện qua:** fixture chạy được, không có secret trong repo, tài liệu baseline hoàn chỉnh.

### Giai đoạn 1 — Nền dữ liệu và an toàn

1. Thêm/chuẩn hóa `sync_schedule_slots`, `sync_jobs`, `sync_attempts`, `sync_locks`.
2. Thêm `admin_audit_logs` và daily snapshot nếu cần lưu lịch sử bất biến.
3. Mã hóa hoặc chuyển Meta token sang secret store.
4. Rà soát RLS, grant và service-role boundary.

**Không triển khai sync hàng loạt trước khi giai đoạn này đạt.**

### Giai đoạn 2 — Sync engine và registry

1. Tách discovery BM/Page khỏi tải metric.
2. Tạo job theo connection/Page/period/metric.
3. Bổ sung lock/idempotency, retry backoff và dead-letter.
4. Ghi rõ `request_error`, `empty_success`, `not_applicable`, `permission_error`.
5. Chạy manual một Page, sau đó một connection, sau đó 5 Page.

### Giai đoạn 3 — API và phân quyền

1. Chuẩn hóa toàn bộ endpoint về access context hoặc đánh dấu legacy admin key.
2. Hoàn thiện role matrix: viewer, analyst, operator, manager, platform_admin, super_admin.
3. Bổ sung quyền Page, nội dung, doanh thu, payout, sync, nhóm và nhân sự.
4. Triển khai admin preview read-only có audit.
5. Triển khai handover nhân sự với successor bắt buộc.

### Giai đoạn 4 — UI và báo cáo

1. Hoàn thiện navigator dùng chung trên mọi route.
2. Tách màn hình Page, nội dung, doanh thu, payout, hoa hồng, nhân sự.
3. Chuẩn hóa period, filter, search, pagination và empty/error states.
4. Desktop/tablet/mobile QA đồng thời.
5. Chỉ hiển thị nhãn kỹ thuật trong tooltip/trang vận hành.

### Giai đoạn 5 — Tự động hóa lịch

1. Bật từng slot active theo cấu hình.
2. Nếu Vercel plan chỉ hỗ trợ một lần/ngày, dùng một cron gọi dispatcher; dispatcher tạo job theo slot đến hạn.
3. Theo dõi runtime, timeout, quota Meta và queue backlog.
4. Chỉ bật 06:00/14:00/22:00 sau pilot và khi concurrency/lock ổn định.

## Kế hoạch 10 ngày làm việc

| Ngày | Việc chính | Có thể chạy song song | Mốc nghiệm thu |
| --- | --- | --- | --- |
| 1 | Baseline, contract, fixture, backup | UI audit, docs audit | danh sách dependency chốt |
| 2 | Migration queue/lock/audit draft | Navigator/mobile shell | migration review đạt |
| 3 | Token hardening và RLS | UI card/table patterns | không lộ secret, policy test |
| 4 | Sync job/attempt/retry | API contract và report fixtures | sync 1 Page thành công |
| 5 | Registry BM/Page và period | Page/content report UI | 5 Page discovery đúng |
| 6 | Access context/RBAC toàn API | Payout/commission UI | role matrix test đạt |
| 7 | Daily snapshot và revenue reconciliation | User/handover UI | số liệu đối soát được |
| 8 | Dispatcher/slot active và observability | Responsive QA | pilot 5 Page đạt |
| 9 | Pilot 20 Page, sửa lỗi | Docs/runbook/release | không có lỗi blocker |
| 10 | Pilot 50 Page, production gate | Final audit | go/no-go production |

## Phân loại ưu tiên

### P0 — phải làm trước

- Token/secret hardening.
- Schema queue/lock/attempt và idempotency.
- Registry Page/BM bất biến.
- Access context/RBAC/RLS.
- Phân loại lỗi sync.
- Backup, logs và rollback.

### P1 — làm ngay sau P0

- Báo cáo Page/nội dung/doanh thu.
- Payout access và commission.
- Navigator thống nhất và responsive.
- Daily snapshots và đối soát doanh thu.

### P2 — tối ưu sau pilot

- Admin preview nâng cao.
- Tự động refresh connection.
- Queue ưu tiên theo Page/connection.
- Tối ưu chi phí và thời gian chạy.

## Cổng nghiệm thu production

- [ ] 5 Page pilot không có job trùng.
- [ ] Một Page lỗi không làm hỏng run.
- [ ] Retry riêng Page hoạt động.
- [ ] Page trong BM và ngoài BM tách đúng.
- [ ] Doanh thu tách API/manual/reconciled.
- [ ] User không có payout access không thấy payout.
- [ ] Role mới không làm hỏng role cũ.
- [ ] Menu và màn hình hoạt động ở 390px và desktop.
- [ ] Tài liệu, migration, runbook và release note cùng commit.
- [ ] Có rollback deployment và database note.

## Quyết định cần chốt trước khi bắt đầu

1. Có chuyển token Meta sang secret store ngay ở P0 không?
2. Vercel hiện tại dùng dispatcher một cron/ngày hay nâng plan để chạy nhiều slot?
3. Daily snapshot lưu toàn bộ metric hay chỉ metric báo cáo đã chọn?
4. Chuẩn auth admin cuối cùng là Supabase session hay giữ legacy admin key có thời hạn?
