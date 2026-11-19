# Nhập kho hàng loạt, giá vốn và người cầm Page — 2026-11-19

Trạng thái: Giá vốn đã ghi production; API/UI đã kiểm thử, đang phát hành. Kế thừa đợt nhập 149 Page; không thay đổi danh sách nguồn.

## Impact note / kế hoạch

- Dữ liệu: theo yêu cầu mới ghi giá nhập 700.000đ cho từng Page của batch `conuongai-held-pages-20261119-v1`, gồm mã cũ từng có giá 650.000đ. Ghi trước/sau trong ledger/audit, không tạo chi phí ghi hỏng hay doanh thu. Không điều chỉnh mã ngoài batch.
- Kho/UI: thêm nút Nhập hàng loạt trong phần nhập kho; đọc CSV/TSV UTF-8 hoặc dán từ bảng tính, có kiểm tra và xem trước trước khi lưu. Giá nhập mỗi dòng hoặc giá chung tùy chọn. Không tự chuyển hàng mới sang Inhouse. Mã mới vẫn nháp theo luồng hiện hành.
- API/database: action `intake_batch` dùng scope intake hiện có, actor lấy từ session server. RPC service-only SECURITY INVOKER nhập toàn batch trong transaction, request ID + hash nội dung chống lặp; có lỗi/trùng ID bất kỳ dòng nào rollback toàn bộ. Không bỏ qua dòng lỗi âm thầm.
- Người cầm/quản lý: cột trong cùng bảng kho tổng và Inhouse hiển thị tham chiếu nguồn cùng danh sách phân công active; một Page có nhiều người, một người có nhiều Page, không thay thế phân công cũ khi giao thêm. Bỏ vùng danh sách nhân sự riêng trên trang Inhouse; chức năng giao nhân sự vẫn dùng assign_inhouse với RBAC hiện có.
- Quyền: không thêm role/scope, không mở RPC cho client. `read` xem thông tin phân công trong kho; `intake` nhập batch; `assign_inhouse` giao người. Tên người cầm hiển thị với người có quyền kho, không trả qua API public.
- Không đổi domain, env, cron, SePay, Meta sync hoặc quyền đơn hàng. Các màn hình dùng chung renderer được cập nhật đồng bộ.
- Tài liệu API/database/frontend/security/runbook/testing/deployment cập nhật cùng commit. Kiểm tra parser, API phủ định, SQL rollback/duplicate/retry và UI 390/768/desktop.

## Lịch sử thay thế

Quy ước NULL giá vốn ở 148 Page và 650.000đ ở một Page của [đợt nhập trước](inhouse-page-import-20261119.md) hết hiệu lực ngày 2026-11-19 theo yêu cầu bổ sung của người dùng, thay bằng 700.000đ/Page với audit điều chỉnh. Danh sách nhân sự riêng trên Inhouse hết hiệu lực khi bản này phát hành, thay bằng cột cùng bảng; dữ liệu phân công không bị xóa.

## Kết quả / hướng dẫn

- Đã ghi 149 Page giá vốn 700.000đ/Page, tổng 104.300.000đ; mỗi mã có audit và ledger trước/sau. Giá vốn không làm thay đổi giá bán, số tiền thanh toán hoặc doanh thu.
- Migration `20261119231000_inventory_intake_batch.sql` đã áp dụng production và đăng ký migration history. Bảng batch RLS, RPC service-only; client chỉ gọi API có xác thực.
- Kho tổng → Nhập kho Fanpage → Nhập hàng loạt CSV / bảng tính → tải mẫu hoặc dán bảng có tiêu đề → kiểm tra → nhập kho nháp. Mỗi lượt tối đa 500 Page/1MB. Hỗ trợ UTF-8, tab, dấu phẩy/chấm phẩy, dấu ngoặc kép và xuống dòng trong ô. Giữ ID như chuỗi để tránh mất chữ số khi dùng Excel.
- Trường bắt buộc: ID Page, Tên hiện tại, Link. Tùy chọn Tài khoản cầm, Giá nhập, BM, Ghi chú. Giá từng dòng ưu tiên giá chung; không có giá giữ NULL, không mặc định là 0. Không nhập tệp XLSX trực tiếp: xuất CSV UTF-8 hoặc sao chép ô từ bảng tính.
- Xem trước 10 dòng đầu và tổng số dòng, cảnh báo link có ID khác. Không chỉnh link theo ID. Trùng với kho hiện tại báo số dòng và không ghi dòng nào. Giữ request ID khi gửi lại sau lỗi mạng; server tự tính hash payload và chống ghi lặp.
- Cột Người đang quản lý có tất cả phân công active (tên + vai trò); không lấy UUID làm nhãn thường dùng. Cột Tài khoản cầm giữ tham chiếu nguồn, không xóa khi gán nhân sự. Một Page được nhiều người cầm/vận hành, một người có nhiều Page; giao thêm không thay thế người cũ.
- 19 test ứng dụng pass (parser, render nhiều người, RBAC API, quyền đơn/vận hành). SQL rollback 8 kiểm tra pass: thiếu quyền, rollback lỗi cuối, giữ giá/trạng thái nháp, retry, payload thay đổi, ID đã có, ID chuẩn hóa trùng, RLS/ACL. Không giữ fixture thử nghiệm.
- CUA kiểm tra 390/768/1280px: cột nhiều nhân sự nằm cùng bảng/thẻ, hộp Import 390px đọc được và cuộn nội dung; dán TSV mẫu và xem trước 1 Page/700.000đ thành công. Không gửi mẫu này vào kho thật.

## Ma trận quyền kế thừa

| Scope hiện có | Tác dụng |
| --- | --- |
| sales_inventory.read | Xem kho cùng tên nhân sự được phân công, không kèm hồ sơ bí mật |
| sales_inventory.intake | Nhập từng Page hoặc CSV/TSV, vẫn kiểm tra server-side |
| sales_inventory.assign_inhouse | Giao thêm nhân sự vào Page Inhouse, không kết thúc phân công khác |
| Thiếu scope / preview read-only | Từ chối thao tác ghi; không chỉ ẩn nút |
