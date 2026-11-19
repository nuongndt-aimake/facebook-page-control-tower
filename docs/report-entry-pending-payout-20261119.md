# Khắc phục chặn nhập báo cáo khi thiếu payout — 2026-11-19

Trạng thái: Đang triển khai. Ảnh người dùng cho thấy ô báo cáo của chính nhân sự bị disabled vì chưa có payout. Điều kiện này cản việc báo cáo công việc.

## Impact note / luồng thay thế

- Lưới cho người được giao nhập/lưu USD dù Page chưa cấu hình payout hoặc payout chưa phù hợp USD. Cảnh báo chỉ mang tính cần bổ sung, không khóa ô. Không tạo payout giả.
- RPC submit giữ nguyên kiểm tra actor/assignment/date/active Inhouse/số liệu/verified; payout snapshot cho phép NULL. Nếu có payout hiện hành active cùng currency thì gắn vào báo cáo mới hoặc lần sửa báo cáo đang thiếu payout. Snapshot đã có giữ nguyên; không tự backfill hay đổi báo cáo đã duyệt.
- Báo cáo thiếu payout vẫn là submitted và xuất hiện trong tổng hợp theo ngày/nhân sự/Page; xác minh số liệu giữ quyền hiện có, không đồng nghĩa đã đối soát hoặc chi trả. Chức năng thiết lập payout duy nhất/Page và lịch sử không đổi.
- API response thêm `payout_pending`; frontend hiện Đã lưu/chờ duyệt kèm cảnh báo. Schema đã cho phép payment_profile_id NULL nên không thêm cột; migration mới chỉ thay function, ACL/service-only giữ nguyên.
- Không đổi role, quyền, domain, env, cron, SePay hay tiền thật. Tài liệu API/database/frontend/reporting/runbook/testing cập nhật cùng bản phát hành với Tổng quan báo cáo.

## Hết hiệu lực

Quy tắc bắt buộc thiết lập payout trước nộp báo cáo tại bản `6d9ab96`/migration `20261119232000` **Hết hiệu lực ngày 2026-11-19**, thay bằng báo cáo trước và bổ sung payout sau qua migration `20261119234000_allow_reporting_pending_payout.sql`. Mô tả/quy tắc cũ giữ làm lịch sử, không áp dụng tiếp.

Kiểm thử trước phát hành: 46 Node tests pass; 44 kiểm tra SQL (15 currency/payout + 17 operations + 12 profile/scope) chạy trong rollback transaction; 9 trường hợp API báo cáo pass, không giữ dữ liệu thử. Migration 20261119234000 đã áp dụng Supabase. Responsive code có breakpoint 390/768/desktop; kiểm tra trình duyệt sau phát hành được ghi riêng, không suy diễn từ test logic.
