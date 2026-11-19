# Runbook vận hành

Gate 2.2: thao tác kho/đơn/Inhouse và giải phóng mã chưa trả theo [runbook kho](inventory-fanpages-runbook.md). Migration trước API; không gọi RPC loose-order-reference cũ. Theo dõi 409 thiếu hàng/trùng ID là lỗi nghiệp vụ, không retry mù. Đơn hết hạn đang giữ mã cần đối soát/trả mã có lý do; chưa có cron tự trả. Thông tin triển khai/QA tại [release](inventory-fulfillment-release-20261119.md).

## Webhook đồng thời — 2026-11-19

Trước deploy API webhook, xác nhận RPC trong migration 20261119203000 có mặt và chỉ service_role EXECUTE. Nếu RPC lỗi, request phải trả lỗi để SePay retry; không đánh dấu thành công bằng một ghi event rời. Khi đối soát, phân biệt processed/duplicate/amount_mismatch/expired/rejected; không tự đổi paid khi gặp event gửi lại. QA concurrency có script `sales-payment-concurrency.sql`; chỉ chạy dữ liệu QA, hủy order/invoice sau test và giữ lịch sử. [Kết quả nghiệm thu](parallel-upgrade-20261119.md).

## Kiểm tra hằng ngày

### Khi Sales Platform được bật (Roadmap)

1. Kiểm tra reservation Fanpage sắp hết hạn, đơn payment mismatch và đơn 0đ chờ xác minh.
2. Đối chiếu ledger kho tổng/kho Inhouse với order và handover audit; không sửa tồn kho thủ công ngoài action có audit.
3. Kiểm tra báo cáo ngày thiếu/quá hạn theo assignment trước khi chốt hoa hồng.
4. Kiểm tra import Google Sheet ở trạng thái lỗi/stale; chỉ retry read-only từng nguồn.

1. Xem slot nào đang active.
2. Kiểm tra `sync_runs` mới nhất.
3. Nếu dispatcher đang bật, kiểm tra thêm `sync_jobs` ở trạng thái `failed/dead_letter` và `sync_attempts`; có thể tắt nhanh bằng `ENABLE_SYNC_ORCHESTRATOR=false` rồi redeploy.
4. Kiểm tra token sắp hết hạn.
5. Đối chiếu số Page và số metric.
6. Kiểm tra độ mới của snapshot.
7. Kiểm tra lỗi Vercel Function và quota Meta trước khi retry hàng loạt.

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

## Xử lý dữ liệu thiếu

1. `request_error`: request Meta/DB thất bại, cần retry hoặc sửa quyền.
2. `empty_success`: request thành công nhưng Meta trả mảng rỗng.
3. `not_applicable`: Page không có loại metric đó.

Chỉ loại thứ hai và thứ ba mới có thể dùng để suy luận "không phát sinh dữ liệu". Không biến lỗi quyền thành số 0.

## Bàn giao người dùng/Page

Việc chọn người tiếp quản và chuyển assignment nhân sự dùng action `offboard_user` trong `/api/admin/access`. Hệ thống bắt buộc chọn successor, chuyển Page/Payout/team/reporting lines và đơn hàng đang phụ trách, kết thúc quyền cũ, sau đó đình chỉ hoặc xóa và ghi audit. Bàn giao deal/Page độc lập vẫn dùng `/api/admin/handover`; sau mỗi thao tác phải kiểm tra `admin_audit_logs`.

## SePay và đơn hàng

1. Production hiện bật `SALES_PUBLIC_CHECKOUT_ENABLED=true` sau nghiệm thu Test Mode và callback SePay Live `HTTP 200` ngày 2026-11-19. Khi callback lỗi hoặc có nghi ngờ đối soát, chuyển ngay về `false`, redeploy, rồi điều tra event chưa khớp.
2. Mỗi đơn tạo server-side có `order_code`/`payment_reference` duy nhất; QR lấy đúng số tiền đã chốt trong `sales_orders`.
3. Webhook `/api/payments/sepay` chỉ nhận `Authorization: Apikey ...` so với `SEPAY_WEBHOOK_API_KEY`; chỉ chuyển `pending_payment` sang `paid` khi tìm đúng mã, đúng số tiền và giao dịch vào. Sai/mơ hồ chuyển `reconciliation_required` và ghi `sales_payment_events`.
4. Không sửa thủ công `paid` trước khi đối chiếu sao kê; nếu cần, dùng màn hình Đơn hàng và kiểm tra `admin_audit_logs`.
5. Khi có lỗi, tắt checkout public, giữ dữ liệu và chuyển các event chưa khớp sang đối soát; không tạo lại đơn hay quét lại giao dịch tiền thật.
6. Webhook Live là #73924, chỉ tiền vào MBBank `****0268`, URL `https://money.aiecom.vn/api/payments/sepay`. Khóa chỉ tồn tại ở SePay và Vercel Production Secret; không reveal, chép vào ticket hoặc commit.
7. Callback thử là kiểm tra kết nối, không phải xác minh luồng tiền. Trước một giao dịch thật đầu tiên, theo dõi đơn tạo mới trong `/sales-orders`, đối chiếu đúng `payment_reference`, số tiền và một event `processed`.

