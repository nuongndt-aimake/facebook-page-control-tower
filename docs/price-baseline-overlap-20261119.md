# Giá mặc định chồng lên lịch giá admin — 2026-11-19

Trạng thái: **Đã khắc phục dữ liệu production**; public config và quote đã trả 3.000.000 đ/Page. Đồng bộ UI admin trong commit này.

Impact: giá public, báo giá checkout, kiểm tra giá trong transaction tạo đơn và hiển thị lịch admin. Không đổi công thức chiết khấu, giá trên đơn cũ, kho, role, domain, môi trường hoặc SePay.

Nguyên nhân: admin đặt 3.000.000 đ hiệu lực từ 00:00 ngày 19/11 giờ Việt Nam. Bản seed 1.500.000 đ có effective_from 09:47 cùng ngày nên bị chọn trước theo thứ tự ngày hiệu lực. Còn một bản admin 3.000.000 đ hiệu lực ngày 20/11; bản tương lai được giữ nguyên.

Migration `20261119215000_repair_baseline_price_overlap.sql` đánh dấu **Hết hiệu lực** bản seed không có người tạo nếu nó chồng lên bản admin đã có hiệu lực. Giữ hàng lịch sử, không sửa hai bản admin. Công thức chọn giá tiếp tục ngày hiệu lực mới nhất trong khoảng hợp lệ. UI admin đồng bộ lọc effective_until để khớp public/checkout, hiển thị bản hết hiệu lực.

Kiểm thử production: 1 Page = 3.000.000 đ; 2 Page giảm 5% = 5.700.000 đ; 5 Page giảm 10% = 13.500.000 đ; 10 Page giảm 15% = 25.500.000 đ. Đơn cũ giữ snapshot, không tạo đơn hoặc giao dịch tiền. Nâng cấp kho/tài sản/báo cáo tiếp tục trong tài liệu riêng `operations-inhouse-reports-20261119.md`.
