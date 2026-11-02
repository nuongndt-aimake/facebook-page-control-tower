# Kết nối Meta và đồng bộ dữ liệu

## Connection

Một connection gồm nhãn, User Access Token, BM IDs, Page IDs và thời hạn token. Token chỉ được dùng ở server; không đưa xuống browser hoặc lưu dạng rõ trong Database.

## Phạm vi dữ liệu

- Page: thông tin Page, BM, nguồn tài sản, task và token health.
- Nội dung: bài đăng, thời điểm, permalink, media type.
- Metric: Page metric và post metric theo kỳ.
- Doanh thu: metric API, dữ liệu manual và dữ liệu reconciled phải tách nguồn.

## Lịch động

Có tối đa ba slot mặc định 06:00, 14:00 và 22:00 giờ Việt Nam. Slot có thể active/inactive và đổi giờ. Chỉ slot active mới tạo `sync_run`.

## Queue dispatcher có cờ bật/tắt

Control-plane gồm `sync_jobs`, `sync_attempts` và RPC `claim_sync_jobs`. Khi `ENABLE_SYNC_ORCHESTRATOR=false` (mặc định), `/api/cron/sync` giữ luồng cũ. Khi bật, endpoint sẽ xếp job theo Page/kết nối/kỳ, nhận việc bằng `FOR UPDATE SKIP LOCKED`, ghi attempt và retry lỗi tối đa 3 lần. `SYNC_DISPATCH_BATCH` giới hạn số job mỗi invocation để phù hợp quota Vercel/Meta. Pilot 5 Page đã đạt 5/5 `succeeded`, mỗi job 1 attempt và 4 metric rows, không có request lỗi/empty; đồng bộ hàng loạt vẫn chưa bật.

**Hiện trạng:** production khai báo ba cron theo ngày nghiệp vụ Việt Nam: `slot_06` (23:00 UTC), `slot_14` (07:00 UTC) và `slot_22` (15:00 UTC), kèm worker bài viết; `ENABLE_SYNC_ORCHESTRATOR=true` và `ENABLE_POST_SYNC_WORKER=true`. Mỗi invocation đọc `periods` của slot active, tạo job idempotent vào `sync_jobs`, claim theo `max_concurrency` rồi ghi `sync_attempts`; slot inactive được bỏ qua. Trên Hobby, mỗi cron vẫn chỉ chạy một lần/ngày và thời điểm thực tế có thể lệch trong phạm vi một giờ. Các lần 22:00 trước khi ba cron được triển khai không thể khôi phục hồi tố.

Màn hình `/connect-meta` đã có bảng cấu hình slot cho quản trị viên: xem trạng thái, giờ Asia/Ho_Chi_Minh, kỳ dữ liệu, concurrency và bật/tắt từng slot. Thao tác dùng `update_sync_slot`, được kiểm tra server-side và ghi `admin_audit_logs`; việc bật slot không tự bật `ENABLE_SYNC_ORCHESTRATOR` và không thay thế bước pilot.

`max_concurrency` chỉ là số job chạy đồng thời. Đây không phải số lần retry. Dispatcher hiện áp dụng giá trị slot (giới hạn vận hành 1–10 job mỗi invocation), thêm delay tối thiểu `SYNC_JOB_DELAY_MS` và jitter `SYNC_JOB_JITTER_MS` giữa các job trong batch. Retry job/request hiện tối đa 3 lần với backoff; lỗi quyền/token bị phân loại và không retry vô hạn.

`/api/admin/access` trả thêm `sync_job_counts` (bộ đếm toàn bộ job theo trạng thái), `sync_jobs` (100 job gần nhất) và `sync_runs` (20 phiên gần nhất). UI dùng `sync_job_counts` để đếm và `sync_jobs` để hiển thị chi tiết, tránh nhầm danh sách 100 bản ghi với tổng hàng đợi.

Trang báo cáo và trang vận hành dùng chung một luồng điều phối. Đồng bộ chủ động theo Page nhận `period` của chu kỳ đang xem; đồng bộ toàn cục có thể chọn `all` (phạm vi tương đương 365 ngày). Khi `ENABLE_SYNC_ORCHESTRATOR=true`, cả thao tác chủ động và slot tự động đều đi qua `sync_jobs`/`sync_attempts`; khi cờ tắt, hệ thống giữ worker tương thích cũ nhưng vẫn ghi `sync_runs`.

Trạng thái hiển thị theo Page lấy từ `page_daily_snapshots` trong đúng phạm vi báo cáo, không dùng mù quáng `sync_runs` mới nhất của một chu kỳ khác. `ok` là đã ghi nhận dữ liệu, `empty` là Meta trả thành công nhưng không có dòng, `warning` là có request lỗi và `not_available` là thiếu quyền/metric. Bản ghi snapshot không bị coi là `0` khi request thất bại.

Cảnh báo Meta hiện được lưu trong `sync_runs.summary.warnings`, `page_daily_snapshots.metrics_json.outcomes` và `pages.current_status`. Các cảnh báo Graph API/permission được hiển thị theo Page; trạng thái vi phạm chính sách chi tiết chỉ được bổ sung khi Meta cấp endpoint/quyền tương ứng, không tự suy diễn từ doanh thu hoặc dữ liệu rỗng.

## Retry và lỗi

- Lỗi quyền: đánh dấu `permission_error`, không retry vô hạn.
- Lỗi tạm thời/429: retry theo backoff.
- Lỗi một Page: không làm hỏng các Page khác.
- Sau số lần thử tối đa: chuyển dead-letter và hiển thị trong màn hình vận hành.

## Phạm vi một phiên

1. Resolve `/me/accounts`, BM `owned_pages` và Page ID cấu hình.
2. Upsert BM/Page và ghi `page_connection_history`.
3. Lấy Page token trong memory của serverless run; không trả về client.
4. Lấy bài đăng, Page insights và post insights theo `since/until`.
5. Upsert `metrics` với khóa chống trùng, đồng thời ghi `page_daily_snapshots` và `post_daily_snapshots` theo ngày quan sát.
6. Ghi `sync_runs` với `failed_requests`, `empty_requests`, warnings và trạng thái từng Page.

## Bài viết và tương tác (đã tích hợp, worker có cờ bật/tắt)

Content discovery và metric refresh phải là hai luồng khác nhau. Discovery hằng ngày chỉ upsert bài mới vào `posts`; làm mới tương tác phải có `post_sync_request` rõ bài, metric và kỳ. Tương tác chuẩn cần tách tối thiểu comments, reactions, shares, views/reach và engagement; thiếu field hoặc thiếu quyền phải mang trạng thái `not_available`/`permission_error`, không ghi 0. Bài đăng cộng đồng đi qua `post_publications` từ Meta, tiện ích mở rộng hoặc nhập thủ công; extension không được giữ token. Migration, API request/provenance và worker claim đã có; post worker xử lý request cụ thể khi `ENABLE_POST_SYNC_WORKER=true`, chưa chạy tự động hàng loạt.

Khi Page sync chạy, discovery vẫn lấy lại `comments`, `reactions`, `shares` và cập nhật `posts.raw_json/synced_at`; đây là cập nhật nhẹ cho bài trong cửa sổ đã chọn. Làm mới sâu hàng loạt bài vẫn phải đi qua worker riêng (`post_sync_requests` → `post_sync_attempts` → `post_metric_snapshots`) để tránh kéo quá nhiều dữ liệu trong một lần đồng bộ Page.

**Kiểm tra bài cộng đồng mẫu:** Post ID `2488016458602946` thuộc group `483081615763117` hiện chưa có trong database. Graph API trả `OAuthException #10` yêu cầu App Review, vì vậy không thể xác minh metadata/tương tác qua connection hiện tại. Hệ thống đã hỗ trợ lưu identity cộng đồng độc lập với `page_id=null` và trạng thái `permission_error/not_available`; không ghi số 0 thay thế.

Nếu một Page không có token hợp lệ, trạng thái phải là lỗi quyền/token; không gán nhãn "chưa kiếm tiền" chỉ vì request thất bại.

