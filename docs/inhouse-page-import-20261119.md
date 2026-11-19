# Nhập danh sách Page đã cầm vào Inhouse — 2026-11-19

Trạng thái: Dữ liệu production đã nhập và đối chiếu; UI đã nghiệm thu cục bộ, đang phát hành. Nguồn: tệp người dùng cung cấp; không đưa danh sách tài sản chi tiết lên Git.

## Impact note

- Kho/UI: hiển thị riêng ID Page, Link, Tên hiện tại, Tài khoản cầm; giữ giá nhập và trạng thái nghiệp vụ, không thêm cột UUID hệ thống. Mobile card, desktop/tablet trong khung.
- Dữ liệu: 149 ID duy nhất; 148 mã mới và 1 mã có sẵn trạng thái available khi preflight. Giữ giá nhập 650.000 đ của mã hiện hữu; mã mới chưa có giá nhập giữ NULL. 89 link có ID khác cột Page ID: giữ nguyên hai dữ liệu theo nguồn. Tên lỗi của 61594069995280 đã được người dùng xác nhận là `wafey hans`.
- Tài khoản: `conuongai@gmail.com` đã tồn tại, active, hiện viewer. Theo yêu cầu quản lý/lên đơn, chuyển sang operator và cấp read/intake/publish/reserve/finalize/assign_inhouse, giữ các quyền khác; không cấp platform_admin hoặc sales_orders.read_all. Gán manager trên các Page nhập và quyền manager cho đúng các Page này.
- Database/API: RPC service-only transaction nhập tài sản đang cầm, tạo đơn 0đ <=100 Page/đơn, xác minh nội bộ, chuyển kho và phân công. Batch key/hash chống nhập lặp; sai trạng thái hoặc lỗi ở bất kỳ bước nào rollback. RLS cho bảng batch, không có API public mới.
- Luồng đặc biệt: đây là nhập số dư tài sản đã cầm vào kho vận hành, không phải xác nhận cấp Facebook mới cho khách. Nhật ký phải ghi `external_access_performed=false`; không dùng checkbox cấp quyền bên ngoài để làm giả thao tác. Không gọi Meta, chuyển tiền hoặc gửi tin nhắn.
- Dữ liệu tài sản và quyền/tuyến cũ không bị xóa. Chặn nếu mã đã giữ cho đơn khác, đã bán, hỏng hoặc Page registry xung đột. Backup các thông tin cần thiết trong audit/báo cáo riêng trước ghi.
- Không đổi DNS, SePay, cron, môi trường. Tài liệu API/database/RBAC/runbook/kiểm thử cập nhật cùng commit; kết quả batch riêng lưu cho người dùng.

## Kiểm thử và nghiệm thu

Chạy dry-run toàn batch trong BEGIN/ROLLBACK, xác nhận 149 mã, các đơn 0đ, 149 kho Inhouse và manager đúng người. Kiểm tra import lặp, từ chối actor thiếu quyền và rollback khi có mã không hợp lệ. Commit thật sau dry-run; đối chiếu từng ID, link, tên, tài khoản cầm, giá nhập giữ nguyên và đơn người mua/phụ trách đúng `conuongai@gmail.com`.

## Kết quả ghi dữ liệu

- Batch `conuongai-held-pages-20261119-v1`: 149 Page, 148 mới / 1 tái sử dụng; từng tên/link/tài khoản cầm đã đối chiếu đúng nguồn. Không sửa 89 liên kết có ID khác.
- Đơn `FS7C92B7DB34` (100 Page), `FS26F4239FC7` (49 Page), giá thanh toán 0đ; verified/completed. Người mua, phụ trách và quản lý Page là tài khoản được yêu cầu. Đây là nhập tài sản đang cầm, không ghi nhận giao dịch ngân hàng hay cấp quyền Facebook mới.
- 149 kho Inhouse active, 149 assignment manager và page_access manager. Profile chuyển viewer→operator, chỉ bổ sung 6 scope kho; không cấp quyền xem tất cả đơn hoặc quản trị nền tảng. Audit thay đổi quyền ghi executor bảo trì theo yêu cầu người dùng, không giả danh thao tác tự cấp quyền.
- 148 mã chưa có giá nhập: NULL (Chưa ghi nhận); mã hiện hữu giữ 650.000đ. Bổ sung giá vốn sau; không tự coi NULL là 0đ.
- Dry-run đã rollback thành công; từ chối actor thiếu quyền, ID trùng, dữ liệu sai ở dòng cuối (rollback toàn bộ), hash không khớp. Chạy lặp cùng batch trả kết quả cũ, không tạo thêm đơn/tài sản.
- RPC SECURITY INVOKER chỉ service_role; anon/authenticated bị từ chối EXECUTE, bảng batch có RLS và không cấp quyền client. Không mở endpoint public mới.
- Chrome hồ sơ Cô Nương AI đã xác nhận kho production hiển thị 149 Page / 149 phân công. Kiểm tra renderer tại 390/768/1280px: phát hiện bảng 768px bó chữ và đổi breakpoint thẻ lên 1000px; kiểm tra lại đạt. 14 test liên quan kho, phân quyền đơn và vận hành đều pass.
- `supabase/tests/held_inhouse_import_rollback.sql`: 9 kiểm tra hồi quy SQL pass, không giữ dữ liệu fixture sau rollback.

## Vận hành / giới hạn

Script bảo trì phải xác minh quyền phê duyệt từ người vận hành, cập nhật quyền có audit trong cùng transaction, gọi RPC và đối chiếu trước COMMIT. Không dùng RPC này để xác nhận bàn giao mới; đơn bán thông thường vẫn dùng xác nhận cấp quyền bên ngoài. Không gọi Meta/sync, không sửa domain/cron/SePay. Không lưu danh sách tài khoản cầm hoặc tệp nguồn vào repository.

### Ma trận quyền áp dụng (không thêm role)

| Chủ thể | Kho | Đơn | Page nhập |
| --- | --- | --- | --- |
| conuongai — operator | read/intake/publish/reserve/finalize/assign_inhouse | Đơn của mình hoặc được phụ trách | manager trên 149 Page |
| Thành viên không được cấp scope | Không có thao tác nhập/chuyển | Chỉ đơn được quyền theo cơ chế cũ | Không được nhận thêm quyền |
| anon/authenticated gọi RPC trực tiếp | Từ chối | Từ chối | Từ chối |
| Bảo trì service_role | RPC kiểm tra actor, batch, dữ liệu | Đơn nội bộ 0đ do actor sở hữu | Gán đúng actor, có audit |
