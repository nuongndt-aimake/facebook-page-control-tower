# Duyệt báo cáo và thao tác kho gọn — 2026-11-19

Trạng thái: Đang dùng; cập nhật nối tiếp bản `a4a4103`.

## Impact note

- Không đổi quyền hay quy tắc xác minh. Làm rõ quyền và ý nghĩa trạng thái hiện hành. UI kho thu nhỏ nút copy trên desktop, giữ vùng chạm lớn trên điện thoại; nút payout không bẻ chữ giữa từ. Không đổi database/API/domain/env/cron. Màn hình báo cáo tự mở rộng kỳ tổng hợp để chứa ngày vừa lưu thành công. Đổi version import để tránh dùng module lưới cũ.
- Kiểm tra responsive 390/768/desktop qua breakpoint; xác nhận trình duyệt production đã thấy input báo cáo editable và cột/nút payout. Kiểm tra tương tác dialog và toàn bộ kích thước viewport chưa hoàn tất vì có người đang thao tác trong cửa sổ Chrome, công cụ yêu cầu dừng nhập và quan sát lại. Không ghi dữ liệu payout/báo cáo giả vào hệ thống thật để kiểm tra giao diện.

## Người duyệt hiện hành

`platform_admin`/`super_admin` có quyền quản trị; `manager` phải có `sales_operations.verify_reports` và chỉ duyệt nhánh thuộc phạm vi mình. Không tự duyệt báo cáo của chính mình; nhân viên/CTV không được duyệt chỉ vì được giao Page. API/RPC kiểm tra server-side, không dựa vào ẩn nút.

## Căn cứ và giới hạn xác minh

- Hệ thống tự kiểm tra Page Inhouse hoạt động, phân công trực tiếp, ngày từ ngày giao đến hiện tại, số bài nguyên không âm, tiền hợp lệ, đơn vị tiền, khóa bản đã duyệt và lịch sử sửa đổi. Payout thiếu không chặn nộp báo cáo.
- Người duyệt đối chiếu số bài thực tế đã đăng trong ngày, doanh thu đúng ngày số liệu và số dư Page tại thời điểm báo cáo với bằng chứng của nhân sự. Lịch sử hiện lưu người gửi, ngày, số liệu, bằng chứng/ghi chú nếu có, người duyệt/thời gian và revisions.
- Đây là quy trình đối chiếu thủ công cần thực hiện; hệ thống hiện chưa bắt buộc bằng chứng đầy đủ hoặc tích hợp công cụ tự kiểm tra bài/doanh thu Facebook. Không được mô tả dữ liệu tự nhập là đã đối soát tự động. Khi thiếu căn cứ, dùng Yêu cầu bổ sung cùng lý do thay vì Duyệt.
- `verified` là xác nhận số liệu báo cáo, không đồng nghĩa xác minh quyền hưởng hoa hồng, duyệt chi hay thanh toán. Chính sách bằng chứng bắt buộc, nguồn đối soát độc lập và duyệt chi là nâng cấp cần chốt riêng trước khi áp dụng; không tự thêm điều kiện nghiệp vụ chưa thống nhất.

## Runbook

Mở Báo cáo ngày, lọc kỳ, xem chi tiết và lịch sử, đối chiếu bằng chứng; người có quyền chọn Duyệt hoặc Yêu cầu bổ sung. Muốn thiết lập payout: tại Kho Inhouse chọn Thiết lập payout trên dòng Page, chọn hồ sơ USD active hoặc tạo mới, lưu ngay tại dialog. Bộ lọc được giữ sau lưu.
