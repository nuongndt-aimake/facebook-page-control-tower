# Runbook vận hành

Tổng quan: vào `/analytics`, chọn kỳ rồi Xem/làm mới báo cáo. Dữ liệu đến từ báo cáo ngày; thiếu số liệu thì kiểm tra phân công, payout, ngày nộp và trạng thái duyệt tại `/daily-reports`. Không dùng đồng bộ Meta để làm mới Tổng quan. [Hướng dẫn thay nguồn](overview-report-source-20261119.md).

## 2026-11-19 — Thiết lập trước khi báo cáo

Người có manage_payout chọn/tạo hồ sơ USD trong Thiết lập payout của Page; hồ sơ xuất hiện tại `/payout`. Chưa cung cấp mã payout thì giữ trạng thái Chưa thiết lập và chặn nộp, không tạo hồ sơ giả. Nhân sự bổ sung phone/Profile Facebook tại `/account`, sau đó mở lại cửa sổ giao người để lấy dữ liệu mới. Tài khoản đếm lại từ Inhouse hiện hành, dữ liệu đồng bộ cũ không còn tính. Báo cáo ngày nhập USD và lưu riêng từng phân công; kiểm tra dòng lỗi trước khi rời ngày. [Chi tiết](daily-report-matrix-20261119.md) · [Phân quyền/giao người](inventory-assignment-profile-20261119.md).

## 2026-11-19 — Nhập kho nhanh

Trong Kho Fanpage, chọn sản phẩm và Nhập hàng loạt; dùng mẫu CSV UTF-8 hoặc dán vùng ô có tiêu đề. Kiểm tra danh sách trước khi nhập kho nháp. Có lỗi/trùng ID thì sửa nguồn và kiểm tra lại, không dùng bỏ qua lỗi. Giao nhân sự tại Inhouse và đọc người đang quản lý ngay dòng Page, hỗ trợ nhiều người. [Hướng dẫn đầy đủ](inventory-bulk-and-inline-assignees-20261119.md).

## 2026-11-19 — Nhập số dư Page đang cầm

Chỉ chạy sau khi có danh sách và chỉ định người quản lý từ người dùng. Parse/đối chiếu ID, giữ nguyên link, không lấy ID URL để ghi đè ID nguồn. Backup trong audit, thử toàn batch bằng ROLLBACK, đối chiếu giá vốn và quyền, rồi COMMIT; chạy lại dùng cùng batch key/hash. 148 mã chưa có giá vốn cần bổ sung sau. [Kết quả lượt nhập và hướng dẫn](inhouse-page-import-20261119.md).

[Runbook mới](operations-inhouse-reports-20261119.md): cấu hình tại Đơn hàng (giá/chiết khấu cùng lịch, mã ưu đãi, mã giới thiệu/quà, hỗ trợ/Zalo); xử lý đơn paid tự đề xuất mã, thiếu hàng ghi nợ, cấp quyền bên ngoài rồi tick xác nhận hoàn tất. Bảo hành giữ lịch sử mã cũ lỗi và Page thay. Tài sản lấy Inhouse, payout nhập tay; CTV nộp tại Báo cáo → Báo cáo cộng tác viên. Cần cấu hình link quà, điện thoại/Zalo/OA thật trước khi hiển thị liên hệ tương ứng; không có dữ liệu mặc định giả.

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


## Bổ sung ngày 2026-11-19 — báo cáo trước, payout sau

Đang dùng trong bản sửa cùng migration `20261119234000_allow_reporting_pending_payout.sql`: nhân sự trực tiếp được nhập/lưu báo cáo USD khi chưa có payout phù hợp. UI cảnh báo cần bổ sung; API trả `payout_pending=true` và giữ snapshot NULL. Khi sửa báo cáo chưa có snapshot, chỉ gắn payout hiện hành active cùng currency. Snapshot đã có và báo cáo đã duyệt không tự đổi. Quy tắc bắt buộc payout trước nộp báo cáo tại migration `20261119232000` Hết hiệu lực ngày 2026-11-19; giữ mô tả cũ để tra lịch sử. Không đổi RBAC, RLS, domain hay cron. Xem [impact note](report-entry-pending-payout-20261119.md).

Cấp/đổi payout trực tiếp tại dòng Page kho Inhouse qua dialog dùng chung; GET/POST inhouse_assets giữ quyền manage_payout và scope Page server-side. Xem [impact note](inhouse-inline-payout-20261119.md).

Bản nối tiếp: [quy trình duyệt thủ công, giới hạn xác minh và thao tác kho gọn](report-verification-and-compact-actions-20261119.md). Người có quyền đối chiếu bằng chứng, không tự duyệt; verified chưa phải duyệt chi. Tổng hợp bao gồm ngày vừa lưu; icon desktop 28px, vùng chạm coarse 44px, payout không bẻ chữ.

2026-11-19: [Menu thao tác kho gọn](inventory-action-menu-20261119.md) thay cụm nút phụ luôn hiển thị bằng popover ⋯. Giữ nút chính, quyền/action server-side không đổi; 47 Node tests pass.

2026-11-19: [Hai kho tài nguyên và menu ghim](page-resource-warehouses-20261119.md). Nguồn ảnh/video theo Page; grants theo assignment, quyền assign_inhouse hiện có + scope; Google riêng tư yêu cầu quyền/duyệt email theo tài khoản cá nhân, không service account hay tự đổi chia sẻ. Migration 20261119235000, API page_resources và assign_resources, menu fixed có spacer. 51 Node/59 SQL checks pass; file Google thật chờ URL do quản lý thiết lập.
