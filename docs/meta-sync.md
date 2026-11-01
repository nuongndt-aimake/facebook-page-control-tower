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

## Retry và lỗi

- Lỗi quyền: đánh dấu `permission_error`, không retry vô hạn.
- Lỗi tạm thời/429: retry theo backoff.
- Lỗi một Page: không làm hỏng các Page khác.
- Sau số lần thử tối đa: chuyển dead-letter và hiển thị trong màn hình vận hành.

