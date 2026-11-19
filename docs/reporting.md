# Báo cáo

Tổng quan `/analytics` hiện lấy trực tiếp báo cáo vận hành theo kỳ và phạm vi vai trò. Tổng quan Meta và nút đồng bộ trên route này **Hết hiệu lực 2026-11-19**, thay bằng [Tổng quan báo cáo](overview-report-source-20261119.md); mô tả Meta bên dưới chỉ là vùng lịch sử/tích hợp cũ, không phải nguồn Tổng quan hiện hành.

## Báo cáo vận hành hiện hành — 2026-11-19

`/daily-reports`: lưới theo ngày, từng phân công/person/Page, ba chỉ số số bài và tiền USD; không cộng USD với dữ liệu VND cũ. Mỗi Page cần một payout hiện hành trước nộp; report giữ payout tại thời điểm nộp. Admin/manager được xem các dòng theo phạm vi nhưng không nhập thay người khác. Ngày là ngày số liệu, mặc định hôm trước; lưu riêng từng dòng, thông báo rõ dòng lỗi và giữ sửa chưa lưu. [Thiết kế và lịch sử thay thế](daily-report-matrix-20261119.md). Các mục đồng bộ Meta dưới đây là lịch sử/phân vùng riêng, không dùng làm nguồn cho báo cáo thủ công Inhouse.

## Page

Hiển thị Page, BM, nguồn tài sản, token health, lần đồng bộ, bài đăng, tương tác, metric và doanh thu.

## Nội dung

Mỗi bài phải có `page_id`, `page_name`, kỳ dữ liệu, chỉ số tương tác và permalink. Hỗ trợ nhóm theo Page, tìm kiếm, lọc, phân trang và mở rộng/thu gọn. Bộ lọc bài viết chỉ tác động lên danh sách bài; không được làm thay đổi lưới/biểu đồ doanh thu theo Page. Tương tác ưu tiên snapshot `post_metric_snapshots` mới nhất trong kỳ, sau đó mới fallback về `posts.raw_json`.

Màn hình phải phân biệt rõ `discovery_synced_at` (lần đọc/ghi nhận bài viết) và `interaction_synced_at` (lần cập nhật chỉ số tương tác). `sync_state` lấy từ `post_sync_requests`: `pending/running`, `succeeded`, `failed/permission_error`; nếu chỉ có bản ghi bài mà chưa có yêu cầu metric thì hiển thị `discovered` — bài đã được đọc nhưng chưa được cập nhật tương tác. Không được dùng một mốc `synced_at` chung để khiến người vận hành tưởng dữ liệu tương tác đã mới.

## Doanh thu

Tách rõ:

1. `estimated_api` — dữ liệu Meta trả về.
2. `manual` — dữ liệu nhập/đối soát thủ công.
3. `reconciled` — dữ liệu đã xác nhận.
4. Payout và hoa hồng.

Không cộng hai nguồn khi chưa có quy tắc đối soát.

## UX bắt buộc

- Luôn hiển thị kỳ dữ liệu và thời điểm cập nhật.
- Không hiển thị nhãn kỹ thuật trong giao diện thông thường.
- Desktop không overlap.
- Mobile dùng card, menu nổi và không ép cuộn ngang.


## Bổ sung ngày 2026-11-19 — báo cáo trước, payout sau

Đang dùng trong bản sửa cùng migration `20261119234000_allow_reporting_pending_payout.sql`: nhân sự trực tiếp được nhập/lưu báo cáo USD khi chưa có payout phù hợp. UI cảnh báo cần bổ sung; API trả `payout_pending=true` và giữ snapshot NULL. Khi sửa báo cáo chưa có snapshot, chỉ gắn payout hiện hành active cùng currency. Snapshot đã có và báo cáo đã duyệt không tự đổi. Quy tắc bắt buộc payout trước nộp báo cáo tại migration `20261119232000` Hết hiệu lực ngày 2026-11-19; giữ mô tả cũ để tra lịch sử. Không đổi RBAC, RLS, domain hay cron. Xem [impact note](report-entry-pending-payout-20261119.md).
