# Kế hoạch hành động tăng tốc triển khai

## Mục tiêu tối đa 48 giờ

Đưa hệ thống lên bản **MVP vận hành có kiểm soát** cho pilot nhỏ trong tối đa 48 giờ liên tục kể từ lúc bắt đầu sprint, ưu tiên không mất dữ liệu, không lộ quyền và có báo cáo đọc được. Không cam kết hoàn thành toàn bộ queue, payout, admin preview và ba slot tự động trong 48 giờ; các phần đó giữ trạng thái `Roadmap`.

## AI acceleration model

AI có thể đẩy nhanh đáng kể các phần nội bộ của dự án bằng cách phân tích code/schema, tạo migration/API/UI, chạy kiểm tra lặp lại, đối chiếu tài liệu và chuẩn hóa dữ liệu. Vì vậy các lane A–H có thể được chuẩn bị gần như đồng thời thay vì chờ từng bước thủ công.

AI **không thể loại bỏ** các giới hạn bên ngoài: người dùng phải authorize Meta/Google, Meta phải trả quyền và dữ liệu, Vercel/Supabase phải nhận deployment/migration, DNS/SSL cần thời gian propagate và quota/rate limit vẫn áp dụng. Các điểm này là blocker ngoài khả năng tăng tốc bằng code.

Nguyên tắc dùng AI trong 48 giờ:

- tạo một contract/fixture chuẩn rồi tái sử dụng cho mọi lane;
- tự động hóa syntax, link, secret scan và smoke test sau mỗi batch;
- để AI đề xuất patch nhưng vẫn kiểm tra diff, quyền và migration trước commit;
- không để tốc độ sinh code vượt quá tốc độ nghiệm thu dữ liệu/quyền;
- mọi thay đổi vẫn tuân thủ `AGENTS.md` và change governance.

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
3. Migration control-plane và RPC claim đã có; worker/dispatcher chỉ chạy sau feature flag và pilot rollback.
4. Mã hóa hoặc chuyển Meta token sang secret store.
5. Rà soát RLS, grant và service-role boundary.

**Không triển khai sync hàng loạt trước khi giai đoạn này đạt.**

**Trạng thái thực thi hiện tại:** control-plane, RPC claim, queue/attempt/retry code, daily snapshot migration và tài liệu đã hoàn tất. Pilot 5 Page đã đạt: 5/5 job `succeeded`, mỗi job 1 attempt và 4 metric rows, 0 failed/empty request; Page `1217277164808495` đã được kiểm tra ghi snapshot vào DB. Giai đoạn 2 đạt pilot; chưa bật đồng bộ hàng loạt và ba slot lịch vẫn inactive.

## Trạng thái sau đối chiếu production 2026-11-01

| Hạng mục | Trạng thái production | Việc còn lại |
| --- | --- | --- |
| Module hóa Function và rewrite | Đang dùng | Theo dõi giới hạn 12 Function khi thêm route |
| Navigator hai lớp theo module | Đang dùng | Audit trực quan từng màn hình |
| Responsive menu/submenu | Đang dùng | Regression 390px/desktop sau mỗi thay đổi CSS |
| Tuyến quản lý một-nhiều `/team` | Đang dùng | Pilot nhiều tầng và xác minh quyền kế thừa |
| Bulk selector và bulk reporting-line API | Đang dùng | Bổ sung audit log/metric vận hành nếu cần |
| Post metric snapshots/refresh có chủ đích | Roadmap/Thử nghiệm | Migration, worker và pilot riêng |
| Cấu hình ba slot đồng bộ 06:00/14:00/22:00 | Đang dùng (cấu hình an toàn) | Kiểm tra plan Vercel, dispatcher, quota và rollback trước khi bật |
| Dispatcher chạy hàng loạt theo slot | Roadmap/Thử nghiệm | Chỉ bật sau pilot và xác minh quota/lock |
| Meta token secret store | Roadmap | Migration an toàn, không làm gián đoạn connection hiện tại |
| Admin preview nhiều tầng | Thử nghiệm | Pilot với membership thực tế và kiểm thử read-only |

Production hiện đã khớp `HEAD`/`origin/main`; không cần tạo lại các commit UI/menu đã phát hành. Bước tiếp theo phải ưu tiên các dòng còn Roadmap/Thử nghiệm ở bảng này.

## Bổ sung kế hoạch: bài viết, tương tác và bài đăng cộng đồng (Roadmap)

### Đối chiếu hiện trạng

| Hạng mục | Hiện trạng | Kết luận |
| --- | --- | --- |
| Định danh/nội dung bài viết | Lưu trong `posts` theo Meta Post ID, có Page, thời điểm, permalink, media và `raw_json` | Đã có nền tảng lưu lại để tái sử dụng |
| Tương tác trong lần lấy bài | Đang lấy `comments.summary(true)` và `shares` trong request bài viết | Chỉ là số quan sát gần nhất; chưa có lịch sử snapshot riêng |
| Reactions | Chưa yêu cầu field `reactions` trong request hiện tại | Không được coi giá trị thiếu là 0 |
| Post insights | `metrics` hỗ trợ `entity_type=post`, nhưng `META_POST_METRICS` mặc định rỗng | Chưa có đồng bộ chỉ số bài viết mặc định |
| Cập nhật lại chỉ số | Luồng Page sync hiện xử lý các bài trong khoảng kỳ đồng bộ | Không phù hợp khi phải làm mới hàng loạt bài cũ |
| Bài đăng cộng đồng | Chưa có nguồn/quan hệ xuất bản cộng đồng | Cần ingest từ tiện ích hoặc nhập thủ công, không suy đoán từ Page posts |

### Mô hình dữ liệu đề xuất

Không thay thế `posts`. Bổ sung theo migration mới, giữ các migration cũ nguyên trạng:

1. `post_publications`: quan hệ bài viết với nơi đăng (`page`, `community`), Page/group ID, tên/URL cộng đồng, thời điểm xuất bản, nguồn phát hiện (`meta`, `extension`, `manual`), trạng thái xác minh.
2. `post_metric_snapshots`: một bản ghi cho mỗi lần quan sát; gồm `post_id`, `observed_at`, `window_start`, `window_end`, các trường chuẩn hóa comments/reactions/shares/views/reach/engagement và `raw_json`.
3. `post_sync_requests`: yêu cầu làm mới có chủ đích; người yêu cầu, danh sách metric, trạng thái queue, attempt, lỗi, thời điểm hoàn tất và idempotency key.

`posts` là bản ghi nội dung/định danh; `post_metric_snapshots` là lịch sử số liệu; `metrics` tiếp tục giữ insight theo metric Meta. Không ghi đè snapshot cũ.

### Luồng vận hành

1. Đồng bộ hằng ngày chỉ phát hiện/upsert bài mới và lưu nội dung; không tự động gọi lại metric cho toàn bộ bài cũ.
2. Mỗi bài hiển thị `last_content_sync_at`, `last_metric_observed_at`, kỳ số liệu và trạng thái `fresh`, `stale`, `pending`, `permission_error`, `not_available`.
3. Người dùng có quyền chọn một bài hoặc nhiều bài rồi tạo `post_sync_request`; worker xử lý theo queue, giới hạn concurrency và ghi attempt.
4. Khi xem báo cáo, hệ thống đọc snapshot phù hợp với kỳ đã chọn; nếu chưa có snapshot thì hiển thị “chưa có dữ liệu”, không hiển thị 0 giả.
5. Nút làm mới một bài phải truyền chính xác `post_id`, metric cần lấy và khoảng thời gian; không chạy lại toàn bộ Page.

### Tiện ích mở rộng cho bài đăng cộng đồng

Tiện ích chỉ gửi URL/Meta Post ID, nơi đăng, thời điểm, Page liên quan và metadata provenance về endpoint server. Tiện ích không giữ Page token/Meta secret. Server xác thực người dùng, kiểm tra Page/group assignment, chuẩn hóa `post_publications`, rồi mới tạo `post_sync_request`. Nếu Graph API không cho đọc bài/group hoặc insight, lưu trạng thái `not_available`/`permission_error` và metadata đã nhập; không biến thành số 0.

### Thứ tự triển khai

1. Chốt metric contract và migration snapshot/request (tuần tự, phụ thuộc schema/RLS).
2. Tách content discovery khỏi metric refresh trong worker (tuần tự sau bước 1).
3. API làm mới một bài/nhiều bài, access context và audit (có thể song song với UI).
4. UI danh sách bài theo Page/kỳ, hiển thị kỳ quan sát, lọc stale/pending và action làm mới (song song).
5. Extension ingest cộng đồng và pilot 5–20 bài (sau khi API/RLS ổn định).

Đối với bài do biên tập viên đăng từ Page vào cộng đồng, provenance bắt buộc gồm `editor_user_id`, `publisher_page_id` và `community_id`; thiếu Page phát hành thì không đánh dấu bài là “đăng từ Page”.

### Tiêu chí nghiệm thu

- Nội dung bài cũ vẫn xem được dù không gọi Meta lại.
- Mỗi số tương tác truy được thời điểm và khoảng thời gian quan sát.
- Làm mới một bài không tạo request cho bài khác.
- Không có quyền/không khả dụng được phân biệt với giá trị bằng 0.
- Bài Page và bài cộng đồng được phân nhóm rõ, có provenance.
- RBAC áp dụng cho cả xem snapshot và tạo yêu cầu làm mới.

### Kết quả kiểm tra mẫu cộng đồng

Post `2488016458602946` trong group `483081615763117` chưa tồn tại trong `posts`. Graph API trả lỗi `OAuthException #10` yêu cầu App Review. Vì vậy bài này chỉ được ingest qua extension/manual khi người dùng cung cấp metadata; metric chỉ chạy khi Meta cấp quyền tương ứng.

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

#### Bổ sung: phạm vi quản lý theo tuyến

1. `team_memberships.parent_user_id` là nguồn sự thật cho cây quản lý; chỉ membership `active` mới tạo quyền kế thừa.
2. `accessContext` phải trả về cả người dùng trực tiếp và toàn bộ tuyến dưới, cùng các Page/Payout được gán cho từng người.
3. Báo cáo phải gắn provenance `direct`, `inherited` hoặc `direct_and_inherited`; không loại Page của tuyến dưới khỏi tổng hợp của tuyến trên.
4. Khi membership kết thúc hoặc tài khoản bị đình chỉ, quyền kế thừa bị loại ở lần dựng context tiếp theo; không cấp quyền ngược từ dưới lên trên.
5. Kiểm thử bắt buộc: nhiều tầng quản lý, Page gán đồng thời trực tiếp/kế thừa, payout access kế thừa, bàn giao successor và user không có membership.

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

## Kế hoạch 48 giờ — emergency sprint

### 0–24 giờ — khóa nền tảng và đường găng

| Khung | Lane A — backend/data | Lane B — UI/report | Lane C — QA/docs/deploy |
| --- | --- | --- | --- |
| 08:00–10:00 | Chốt schema hiện tại, backup, kiểm tra RLS và env | Chốt navigator, period/filter contract | Tạo baseline, fixture 5 Page, ghi blocker |
| 10:00–13:00 | Sửa lỗi auth/access context và token leak | Sửa overlap/menu/mobile trên màn hình chính | Syntax check, secret scan, deploy Preview |
| 14:00–17:00 | Ổn định `refresh_assets`, `sync_page`, phân loại lỗi | Hoàn thiện Page/content/revenue report | Smoke test quyền, callback Meta, logs |
| 17:00–19:00 | Sync thử 1 Page và kiểm tra metrics | Kiểm tra desktop/mobile 390px | Cập nhật tài liệu và quyết định go/no-go ngày 2 |

**Kết quả bắt buộc ở giờ 24:** đăng nhập được, Meta callback đúng, refresh asset được, sync một Page được, báo cáo không gọi Meta trực tiếp, mobile menu hoạt động.

### 24–48 giờ — pilot và khóa phát hành

| Khung | Lane A — backend/data | Lane B — UI/report | Lane C — QA/docs/deploy |
| --- | --- | --- | --- |
| 08:00–10:00 | Chạy pilot 5 Page, sửa lỗi token/permission | Tách nguồn BM/cá nhân và trạng thái dữ liệu | Đối chiếu `sync_runs`, log và dữ liệu thiếu |
| 10:00–13:00 | Retry riêng Page lỗi, kiểm tra idempotency hiện có | Hoàn thiện bộ lọc, phân trang, card mobile | Regression auth/RBAC và payout visibility |
| 14:00–16:00 | Chốt snapshot/metric hiện có, không mở rộng schema rủi ro | Visual QA toàn bộ màn hình chính | Deploy Production candidate |
| 16:00–18:00 | Kiểm tra rollback và backup | Kiểm tra navigator mọi route | Nghiệm thu, ghi release note, cập nhật roadmap |

**Kết quả bắt buộc ở giờ 48:** pilot 5 Page đạt, dữ liệu lỗi được phân biệt với số 0, không có lỗi quyền nghiêm trọng, giao diện desktop/mobile không blocker, có rollback.

## Phạm vi phải làm trong 48 giờ

- Auth Google/Supabase và access context hiện có.
- Meta OAuth callback production.
- Asset registry BM/Page và phân biệt BM/cá nhân.
- Manual `refresh_assets`, `sync_page`, sync period đang có.
- Báo cáo Page, nội dung, doanh thu đọc từ dữ liệu đã lưu.
- Navigator, mobile menu, responsive cho màn hình chính.
- Kiểm tra quyền payout và role hiện có.
- Tài liệu, smoke test, release note và rollback.

## Phạm vi hoãn sau sprint 48 giờ

- Ba slot 06:00/14:00/22:00 chạy tự động đầy đủ.
- Queue/lock/dead-letter hoàn chỉnh nếu chưa đủ thời gian kiểm thử.
- Daily snapshots toàn bộ metric.
- Admin preview read-only có audit.
- Handover nhân sự tự động.
- Encryption/secret store migration lớn nếu có nguy cơ làm gián đoạn production.
- Pilot 20/50 Page.

Các mục hoãn phải giữ trong roadmap với trạng thái `Roadmap`, không xóa khỏi tài liệu.

## Tiêu chí dừng triển khai

Dừng mở rộng pilot nếu có một trong các điều kiện:

- Token/secret xuất hiện trong response hoặc log.
- User không được cấp quyền xem được Page/payout.
- Meta callback hoặc Google login lỗi trên production.
- Sync lỗi một Page làm hỏng toàn bộ run.
- Báo cáo trộn sai kỳ dữ liệu hoặc biến lỗi request thành doanh thu 0.
- Mobile menu không thao tác được hoặc layout bị overlap.

## Kế hoạch sau 48 giờ

Sau khi MVP ổn định, tiếp tục theo các mốc 1–2 ngày/lần: queue/lock → snapshot → payout/commission → admin preview → tăng pilot 20/50 Page. Mỗi mốc phải có nghiệm thu riêng, không gộp tất cả vào một lần deploy.

## Lộ trình mở rộng 10 ngày — sau emergency sprint (không thuộc cam kết 48 giờ)

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
