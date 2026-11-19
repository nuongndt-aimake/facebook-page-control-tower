# Thao tác kho gọn trong menu — 2026-11-19

Trạng thái: Đang dùng.

Impact note: bảng Kho và Inhouse dùng chung renderer. Giữ Giao nhân sự/Mở bán là nút chính tùy trạng thái và quyền; Chi tiết, Sửa tên, Lịch sử, Báo hỏng chuyển vào menu ⋯ trên từng dòng. Dùng popover nằm trên bảng, đóng bằng chọn mục, bấm ngoài hoặc Escape; không bị cắt ở cuối bảng. Tên Page gắn trong nhãn truy cập menu. Giữ nguyên dataset/action, API/RBAC server-side, quyền và điều kiện trạng thái từng thao tác. Không migration, thay dữ liệu, env, cron, domain hay Meta. Payout tại chỗ không đổi. Các nút phụ xếp dọc thường trực của bản dbaa450 Hết hiệu lực ngày 2026-11-19; thay bằng menu trong bản này, giữ lịch sử tài liệu.

QA: kiểm tra thao tác có/không quyền, trạng thái được báo hỏng/mở bán, escape nội dung; kiểm tra 390px, 768px, desktop, mở/đóng menu và vị trí sát cuối viewport. Frontend/runbook/testing/deployment cập nhật cùng commit.

Kết quả QA: 47 Node tests pass. Computer Use đã kiểm tra renderer thực tế với dữ liệu mẫu cục bộ trong iframe viewport 390px, 768px, 1280px: thao tác chính/⋯ cùng hàng; menu 390px tự đẩy lên trên khi gần đáy, Escape đóng; desktop menu nằm trong viewport, chọn Chi tiết đóng menu và mở dialog đúng Page. Không sử dụng dữ liệu mẫu để ghi production. Bản code 4778c07; phát hành Git/Vercel vào project AIMAKE hiện có, không thay cấu hình.
