# Runbook vận hành

## Kiểm tra hằng ngày

1. Xem slot nào đang active.
2. Kiểm tra `sync_runs` mới nhất.
3. Kiểm tra job failed/retry/dead-letter.
4. Kiểm tra token sắp hết hạn.
5. Đối chiếu số Page và số metric.
6. Kiểm tra độ mới của snapshot.

## Khi đồng bộ lỗi

1. Xác định `run_id`, `job_id`, Page và connection.
2. Kiểm tra lỗi Meta và quyền token.
3. Retry riêng job lỗi, không chạy lại toàn hệ thống ngay.
4. Nếu lỗi hàng loạt, tắt slot active và giữ dữ liệu snapshot cũ.
5. Sau khi sửa, chạy một Page kiểm chứng trước.

## Rollback

- Rollback deployment Vercel nếu lỗi code.
- Không rollback bằng cách xóa dữ liệu.
- Migration phải có hướng dẫn khôi phục riêng.
- Giữ nguyên snapshot đã xác nhận.

