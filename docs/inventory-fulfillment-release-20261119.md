# Nhập kho atomic, bán ngoài và Inhouse — 2026-11-19

Trạng thái: **Đã phát hành production** trên `https://money.aiecom.vn`, commit triển khai `4669201`, Vercel `dpl_CxA7vGGBtvpNdrvEMx4tuPHXkvy4` READY. Kế thừa thiết kế Sales Platform, không kết nối Meta.

## Impact note và phạm vi phát hành

- Database: migration additive; RPC transaction intake/publish/reserve/release/finalize/assignment; bảng liên kết mã kho với đơn, cột nguồn Page. Giữ ID Page unique, khóa dòng và lịch sử ledger. RLS bật và client không được đọc/ghi/gọi RPC; SECURITY INVOKER, service_role duy nhất.
- API: endpoint inventory hiện có dùng RPC; thêm sales_fulfillment và sales_inhouse trong function admin hiện có. Kiểm tra access context, quyền và phạm vi đơn trên server; RPC kiểm tra lại actor/permission.
- UI: kho có lịch sử và thao tác gắn đơn; đơn có panel giữ mã/bàn giao; route /inventory-inhouse có menu Vận hành và phân công theo quyền. Bảng giữ đủ cột và cuộn ngang.
- Quyền: kế thừa read/intake/publish/reserve/release/finalize; thêm assign_inhouse qua permissions JSON và UI nhân sự. Không thêm role. Không cấp ngầm quyền chỉ vì role manager hoặc nhìn thấy nút.
- Không đổi DNS, SePay credentials, cron, giá hay dữ liệu khách thật. Không tự giao Facebook quyền hoặc đồng bộ Page.

## Các luồng độc lập và thứ tự

1. RPC intake + rollback/duplicate tests; chuẩn hóa tên/ID và input tiền.
2. Liên kết đơn/mã kho, giữ nhiều mã atomic theo số lượng; release có lý do, không chốt đơn chưa trả tiền.
3. Chốt ngoài hoặc Inhouse atomic, Page registry nguồn sales không cần sync; chống chốt lại và chuyển hai kho.
4. UI Inhouse, chỉ định cộng tác viên bằng manager/capability, kế thừa Page assignment/access hiện có.
5. UI đơn, ledger kho và chỉ số trạng thái, negative RBAC, responsive, runbook.

## Ma trận quyền

| Quyền | API/luồng | Phạm vi |
| --- | --- | --- |
| read | Danh sách kho/Inhouse/ledger | Kho nội bộ |
| intake | Nhập và sửa tên Page | Mã kho; không được mở bán |
| publish | Mở bán | Chỉ draft |
| reserve | Giữ mã theo đơn | Đơn được giao hoặc read_all/admin; đúng sản phẩm/số lượng |
| release | Trả mã giữ | Đơn trong phạm vi, có lý do |
| finalize | Bán ngoài/chuyển Inhouse | Đơn trong phạm vi, paid; 0đ phải verified |
| assign_inhouse | Chỉ định nhân sự vận hành | Page trong kho Inhouse, target active; không sửa quyền nền tảng |
| Admin | Tất cả scope | Mặc định; vẫn tuân thủ invariant trạng thái |
| Người mua/nhân viên không cấp scope | Xem đơn trong phạm vi | Không ghi kho/chốt bàn giao/phân công |

Inhouse yêu cầu đơn 0đ đã verified; bán ngoài yêu cầu đơn paid. Các mã chuyển Inhouse rời kho tổng và tạo Page registry có provenance sales; không ghi đè Page đã có từ nguồn khác. Assignment không đồng nghĩa cấp quyền Facebook thật.

## Kiểm thử và dữ liệu thử

SQL transaction rollback cho trùng Page ID, lỗi giữa intake và cuối audit; reserve cùng mã; sai đơn/khác sản phẩm/quá số lượng; finalize chưa trả tiền; chốt trùng; transfer tạo Page sai; manager assignment sai target. Dữ liệu QA phải tách nhãn và không mở bán/bàn giao thật. Test API mock âm quyền và test DB dưới service_role. Không chỉnh quyền hay dữ liệu nhân viên thật để kiểm thử.

## Kết quả kiểm thử 2026-11-19

- `supabase/tests/inventory_fulfillment_rollback.sql`: 21 kiểm tra đạt trên Supabase production trong transaction rồi rollback. Dùng identity, sản phẩm, Page và đơn QA riêng. Trùng ID có số 0 đầu, lỗi chèn detail giữa chừng, ledger/audit không dở dang; checkout thiếu hàng không sinh đơn; paid/zero verification; bán ngoài; Inhouse tạo registry một lần; assignment idempotent; quyền client/RPC bị chặn.
- Hai connection PostgreSQL độc lập: nhập đồng thời một ID → một commit, một lỗi 23505, không orphan. Hai checkout một mã → một đơn/giữ kho/hóa đơn, một lỗi thiếu hàng. Dữ liệu QA đã dọn theo đúng UUID sản phẩm.
- `SECURITY INVOKER` đã gọi thành công dưới `service_role`; không mở quyền trực tiếp cho authenticated/anon.
- `node --test`: 12 kiểm tra đạt, gồm âm quyền API kho, preview chỉ đọc, sai phạm vi đơn, giả actor, chiết khấu/QR, quyền đơn và webhook.
- Bổ sung DB: nhân viên có scope nhưng chưa được giao đơn bị chặn; được giao thì giữ mã idempotent; thu hồi scope có hiệu lực ngay; giữ batch có mã sau lỗi rollback mã trước.
- Responsive đã kiểm tra 390×844, 768×1024 và 1440×960 bằng dữ liệu giao diện QA cục bộ. Form/button 42px, menu active Kho Inhouse và hộp phân công mở được, bảng cuộn trong khung. Phát hiện và sửa xung đột CSS mobile ép cột kho quá hẹp; không còn ép cuộn ngang toàn trang. Fixture này không phải giao dịch thật.
- Phát hiện và sửa SQL biến `order_id` trùng tên cột trước khi API mới được deploy. Sửa gán người phụ trách không làm lùi đơn đã in_progress/completed về assigned.
- Nghiệm thu qua API production với login thật của các tài khoản QA riêng: 17 kiểm tra đạt (anon/viewer bị chặn, admin nhập/mở bán/chống trùng, tạo đơn Inhouse 0đ, người mua thấy đơn mình nhưng không ghi kho, giữ/xác minh/chốt/chốt trùng, giao người vận hành, đọc kho/ledger, người mua khác không thấy đơn). Đã dọn toàn bộ tài khoản, Page, sản phẩm, kho, đơn và dữ liệu phụ QA; không chuyển tiền hoặc cấp quyền Facebook thật.
- `/inventory-inhouse`, `/inventory-fanpages`, `/sales-orders` trả HTTP 200 tại domain chính, không bị đăng nhập Vercel/404. Đồng bộ sửa CSS cột tối thiểu cho cả bảng đơn và bảng kho.

## API và tương thích

`/api/admin/access?endpoint=sales_inventory|sales_fulfillment|sales_inhouse`: GET kiểm tra read; POST kiểm tra scope theo action và context ghi hợp lệ. Scope actor lấy từ session, RPC kiểm tra lại profile đang active. `sales_fulfillment` yêu cầu order_id và phạm vi assignee/read_all/admin. `create_inhouse_order` và `verify_zero` còn yêu cầu vai trò nhân viên. Không nhận actor do client khai báo.

RPC `sales_checkout_create` thay chuỗi ghi checkout rời rạc. RPC `sales_inventory_command` thay nhập/giữ/chốt cũ, với lock order rồi item theo ID. Old RPC giữ định nghĩa lịch sử nhưng **Hết hiệu lực** làm entry point; thu hồi EXECUTE service_role. Bảng `sales_order_inventory_items` giữ snapshot tên/ID/mã và unique partial chống cùng mã thuộc hai đơn đang giữ/đã bán. Các đơn cũ không có link kho vẫn đọc được và cần giữ mã trước bàn giao. Cột mới additive, không đổi domain, env hoặc secret.

## Vận hành và phục hồi

Deploy migration trước API; nếu API lỗi rollback code nhưng giữ schema additive. Không bật lại RPC ghi cũ vì bỏ qua chốt paid/phạm vi đơn. Không xóa lịch sử ledger/đơn thật để hoàn tác nghiệp vụ. Dùng đối soát khi đã bán; thao tác trả mã chỉ trên reserved, có lý do. Chưa tự giải phóng theo TTL hoặc cron vì chưa chốt chính sách.

## Hạng mục kế thừa/chờ quyết định

Tự hết reservation bằng cron vẫn chờ chính sách thời hạn/release đã ghi trong thiết kế; không tự đặt TTL hoặc bật job. Báo cáo ngày/hoa hồng/Sheet có schema nền; chưa tự đặt đơn giá hoa hồng hoặc kết nối Google khi chưa chốt nguồn/quyền. Các nhóm sản phẩm 2–4 tiếp tục chờ nâng cấp.
