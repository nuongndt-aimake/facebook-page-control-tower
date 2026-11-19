# Báo cáo ngày dạng lưới theo Page — 2026-11-19

Trạng thái: Đã phát hành production, bản chức năng `6d9ab96`, Vercel success (`9m1Yk1oYh2S328taA4BdLLkWPxVF`). Migration đã áp dụng; tài khoản/báo cáo được đối chiếu trên database thật. Bản chốt loại lưới nhập khỏi bộ tự thêm STT/phân trang chung bằng `data-no-pagination`, giữ cấu trúc cột/ô nhập ổn định.

Nghiệm thu: 40 test Node; SQL currency/payout 15, hồi quy vận hành 17, hồ sơ/phạm vi/account 12 (44 tổng) pass trong rollback. CUA lưới USD 390/768/1280px và modal payout đạt quan sát; nhập thử trước thay đổi tiền tệ đã kiểm tra lưu dòng/lưu dòng thay đổi. Phiên CUA kết thúc bởi công cụ kiểm tra URL; không dùng nó làm chứng cứ cho toàn bộ modal giao người sau đó. Payout production hiện chưa có hồ sơ: phải cấu hình mã thực tế trước báo cáo, không tạo giả.

## Điều chỉnh chốt tiếp theo — USD và payout

- Nhãn tiền (đ) của bản lưới thử nghiệm bên dưới **Hết hiệu lực trước khi phát hành**, thay bằng USD ($) theo xác nhận người dùng. Giá vốn kho/thanh toán VND giữ nguyên, không dùng tỷ giá ngầm.
- Thêm currency + revenue_amount + cumulative_amount vào báo cáo. Dữ liệu cũ giữ VND và số tiền ban đầu; các cột `_vnd` chỉ dùng VND, báo cáo USD không được ghi đô vào cột VND. Tổng hợp/dashboard tách theo currency; không cộng chéo USD/VND. Revision giữ currency và payout snapshot.
- Mỗi Page có duy nhất một payout đang dùng qua bảng mapping page PK; một payout có thể nhận nhiều Page. Quan hệ payout cũ và lịch sử thay payout vẫn được giữ. Chỉ tự backfill Page có đúng một quan hệ không mơ hồ; nhiều payout cũ cần chọn lại, không tự đoán.
- Trên lưới và Tài sản có phần chọn payout có sẵn/tạo hồ sơ mới. Tạo mới lưu vào payment_profiles chung; gán Page đồng thời vào mapping. Báo cáo mới yêu cầu payout, snapshot payout_id lúc nộp. Page thiếu payout vẫn nhìn thấy và chỉ rõ cần thiết lập, không tạo payout giả.
- Quyền cấu hình payout dùng capability `sales_operations.manage_payout` hiện có; người báo cáo chỉ xem mã/tên/tiền tệ payout của Page được giao, không được đọc tài khoản ngân hàng hoặc tự mở rộng quyền. Không tự cấp quyền quản lý payout toàn hệ thống cho người chỉ có quyền kho.
- Phạm vi liên thông bổ sung: migration/schema/RLS/RPC báo cáo và payout, API operations và payout registry, bảng tổng hợp và widget tổng quan. Menu giữ `/daily-reports`, `/access`, `/payout`; thêm liên kết tới hồ sơ payout từ màn hình cấu hình. Các API cũ quản lý Page Inhouse phải đi qua cùng mapping một payout để không tạo đường ghi thứ hai.

## Impact note / thiết kế chốt

- Route `/daily-reports` giữ nguyên trong menu Báo cáo. Thay form chọn một Page bằng chọn ngày ở trên và danh sách tất cả Page đang được phân công trực tiếp cho tài khoản đăng nhập, mỗi Page một dòng.
- Ba cột nhập: Số bài đăng; Tiền kiếm được ngày hôm trước (đ); Tiền Page hiện tại (đ). Có trạng thái và nút lưu mỗi dòng, lưu các dòng đã thay đổi. Ô chưa nhập để trống, không tự ghi nhận 0. Báo cáo đã duyệt chỉ đọc.
- Kế thừa `report_date` là ngày số liệu/ngày được chọn, mặc định hôm trước; không dịch lại ngày hoặc đổi nghĩa dữ liệu cũ. Ngày số liệu không được trước ngày được phân công hoặc sau hôm nay. Nếu mọi Page mới được giao sau ngày mặc định, chọn ngày đầu có thể báo cáo. Khi chọn ngày cũ trước phân công, dòng hiển thị lý do và không cho ghi.
- Mỗi dòng lưu theo assignment + reporter + date qua `content_report_command('submit')` hiện có. Không cho quản lý ghi thay tuyến dưới; không gộp kết quả của nhiều người cùng Page. Chọn ngày nạp lại số liệu của đúng người, đúng phân công.
- Kết quả tổng quan, báo cáo theo nhân sự/Page, duyệt/từ chối, lịch sử sửa giữ nguyên. Bằng chứng/ghi chú đã có phải giữ khi sửa ba số liệu từ lưới.
- API/schema/RLS/role/cron/env/domain không đổi. Dùng API POST submit hiện có, ownership và active Inhouse kiểm tra trong SQL; GET lưới yêu cầu riêng khoảng một ngày để không phụ thuộc bộ lọc kỳ tổng hợp.
- Lưu nhiều dòng là các request riêng: kiểm tra đầu vào trước, hiển thị rõ từng dòng thành công/lỗi; giữ dữ liệu chưa lưu khi một dòng lỗi, không tuyên bố rollback chung. Không ghi hàng loạt các dòng chưa thay đổi.
- Responsive 390/768/desktop, bàn phím, label riêng từng Page/ô, nút min42px; nhỏ dùng thẻ vẫn cùng 3 chỉ số. Giữ dữ liệu đang sửa khi tổng hợp tải lại; đổi ngày hỏi bỏ dữ liệu chưa lưu.
- Tài liệu frontend/API/database/phân quyền/reporting/runbook/testing/roadmap cập nhật cùng commit. Không thay chính sách hoa hồng hoặc kết nối Google Sheet.

## Lịch sử thay thế

Form nộp báo cáo một Page tại một thời điểm hết hiệu lực khi bản lưới phát hành; thay bằng lưới trực tiếp. Dữ liệu, bằng chứng và revision cũ không bị xóa.

## Bổ sung ngày 2026-11-19 — báo cáo trước, payout sau

Đang dùng trong bản sửa cùng migration `20261119234000_allow_reporting_pending_payout.sql`: nhân sự trực tiếp được nhập/lưu báo cáo USD khi chưa có payout phù hợp. UI cảnh báo cần bổ sung; API trả `payout_pending=true` và giữ snapshot NULL. Khi sửa báo cáo chưa có snapshot, chỉ gắn payout hiện hành active cùng currency. Snapshot đã có và báo cáo đã duyệt không tự đổi. Quy tắc bắt buộc payout trước nộp báo cáo tại migration `20261119232000` Hết hiệu lực ngày 2026-11-19; giữ mô tả cũ để tra lịch sử. Không đổi RBAC, RLS, domain hay cron. Xem [impact note](report-entry-pending-payout-20261119.md).
