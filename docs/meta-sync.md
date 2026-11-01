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

**Hiện trạng:** `vercel.json` hiện chỉ khai báo cron `0 1 * * *` (một lần/ngày theo UTC). Bảng slot, idempotency, queue/lock và RPC claim đã có; dispatcher vẫn tắt mặc định để tránh bật hàng loạt ngoài pilot.

Màn hình `/connect-meta` đã có bảng cấu hình slot cho quản trị viên: xem trạng thái, giờ Asia/Ho_Chi_Minh, kỳ dữ liệu, concurrency và bật/tắt từng slot. Thao tác dùng `update_sync_slot`, được kiểm tra server-side và ghi `admin_audit_logs`; việc bật slot không tự bật `ENABLE_SYNC_ORCHESTRATOR` và không thay thế bước pilot.

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

**Kiểm tra bài cộng đồng mẫu:** Post ID `2488016458602946` thuộc group `483081615763117` hiện chưa có trong database. Graph API trả `OAuthException #10` yêu cầu App Review, vì vậy không thể xác minh metadata/tương tác qua connection hiện tại. Hệ thống đã hỗ trợ lưu identity cộng đồng độc lập với `page_id=null` và trạng thái `permission_error/not_available`; không ghi số 0 thay thế.

Nếu một Page không có token hợp lệ, trạng thái phải là lỗi quyền/token; không gán nhãn "chưa kiếm tiền" chỉ vì request thất bại.

