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
5. Upsert `metrics` với khóa chống trùng; daily snapshot riêng vẫn là roadmap.
6. Ghi `sync_runs` với `failed_requests`, `empty_requests`, warnings và trạng thái từng Page.

Nếu một Page không có token hợp lệ, trạng thái phải là lỗi quyền/token; không gán nhãn "chưa kiếm tiền" chỉ vì request thất bại.

