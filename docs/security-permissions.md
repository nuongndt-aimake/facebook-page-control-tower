# Auth, RBAC và admin preview

## 2026-11-19 — Phạm vi Page bắt buộc

Admin xem tất cả; manager xem trực tiếp và toàn tuyến; operator/analyst/viewer/CTV chỉ trực tiếp. SQL helpers + API kiểm tra cả thao tác, dữ liệu danh sách, ledger và payout; `read_reports_all` non-admin không còn mở vượt tuyến (**Hết hiệu lực quy tắc cũ**). Quyền intake/assign/manage_payout vẫn bắt buộc. Chỉ người được giao tự nộp; quản lý có verify_reports mới duyệt tuyến, không tự duyệt. Contacts chỉ tự sửa qua RPC atomic; thông tin phone/Facebook của người khác chỉ trả cho chức năng giao người được cấp quyền. [Ma trận đầy đủ](inventory-assignment-profile-20261119.md).

## 2026-11-19 — Batch intake kế thừa phân quyền chủ động

Scope intake dùng cho nhập đơn/hàng loạt, read cho kho và nhãn phân công; không thêm role hoặc quyền xem mọi đơn. RPC batch không cho anon/authenticated gọi trực tiếp; API lấy actor từ session, preview không được ghi. Tên phân công chỉ trả sau kiểm tra quyền kho. [Ma trận, audit và QA](inventory-bulk-and-inline-assignees-20261119.md).

## 2026-11-19 — Quyền nhập tài sản Inhouse

Không thêm role. Nhân sự operator phải được cấp đủ scope kho trước khi RPC nhập tài sản đã cầm cho phép chạy; RPC không cấp quyền cho chính actor. Quyền operator và quyền manager từng Page có audit riêng. Không suy ra quyền xem tất cả đơn. [Ma trận và giới hạn](inhouse-page-import-20261119.md).

Đợt mới: thêm inventory.writeoff/warranty và sales_operations.manage_payout/verify_reports/read_reports_all; [ma trận và âm quyền](operations-inhouse-reports-20261119.md). Người được phân công nộp báo cáo mình; manager kế thừa visibility nhưng không có quyền duyệt ngầm, không tự duyệt. Payout chỉ trả đầy đủ theo scope/access, INHOUSE yêu cầu staff + finalize. Gift URL chỉ sau paid, đơn 0đ còn phải verified. Phân bổ/bảo hành/chốt kiểm tra cả capability và assignee/read_all/admin; chốt cần access_granted. Không tự cấp quyền Facebook thực tế.

Gate 2.2: thêm capability `sales_inventory.assign_inhouse`, không thêm role. Ma trận API/UI/database đồng bộ tại [release](inventory-fulfillment-release-20261119.md). POST kho dùng actor session, active profile và scope; order action còn kiểm tra assignee/read_all/admin. Owner không được tự chốt. Preview không ghi. Chỉ định nhân sự qua kho Inhouse tạo assignment + page_access hiện có, không cấp quyền Facebook và không thay quyền nền tảng. Client không gọi RPC hoặc truy cập bảng link kho trực tiếp.

## Auth

- Google OAuth qua Supabase.
- Callback production: `/analytics`.
- Tài khoản mới bắt đầu ở trạng thái `viewer` hoặc role đã cấu hình.
- Tài khoản suspended/deleted không được truy cập API.

## Quyền

Quyền cần tách theo domain:

- xem Page;
- xem nội dung;
- xem doanh thu;
- xem payout;
- đồng bộ;
- sửa nhóm;
- quản lý nhân sự;
- cấp quyền tài chính.

## Sales Platform — kho Fanpage Gate 2 (`Thử nghiệm`)

Permission `sales_inventory` đã có hiệu lực server-side cho API kho, lưu trong `profiles.permissions.sales_inventory` dưới dạng danh sách thao tác. `platform_admin` và `super_admin` có toàn quyền; các role khác chỉ có đúng thao tác được cấp. Không suy quyền từ việc ẩn/hiện nút UI.

| Permission | Tác dụng |
| --- | --- |
| `read` | Xem danh sách kho và trạng thái Inhouse. |
| `intake` | Nhập Page ở trạng thái nháp. |
| `publish` | Đưa mã nháp thành hàng sẵn sàng bán. |
| `reserve` / `release` | Giữ hoặc nhả mã theo mã đơn, qua RPC khóa hàng. |
| `finalize` | Hoàn tất bán ngoài hoặc chuyển Inhouse, qua RPC khóa hàng. |

Các scope còn lại `inhouse_fulfillment`, `affiliate`, `content_contributor` và policy/configuration vẫn là `Roadmap`. Nhân viên chỉ xác minh đơn 0đ/hoàn tất bàn giao của đơn hoặc Page được chỉ định; manager chỉ có visibility kế thừa, không tự phát sinh quyền lợi tài chính.

Quản trị viên cấp hoặc thu hồi từng scope kho tại **Nhân sự → Quyền → Kho Fanpage**. Đây là thay đổi có audit; UI không làm quyền có hiệu lực nếu server từ chối. Cấp `read` trước khi cấp các thao tác còn lại để nhân sự có thể kiểm tra mã kho và trạng thái.

## Kế thừa tuyến quản lý

Manager/lead xem được người tuyến dưới đang active và tài sản được gán cho họ. Page kế thừa phải được đánh dấu `inherited` trong access context/báo cáo; Page gán trực tiếp là `direct`, nếu có cả hai nguồn là `direct_and_inherited`. Hồ sơ tuyến hiển thị cả người quản lý trực tiếp, vai trò hiện tại, số Page/Payout và số tuyến dưới. Khi bàn giao, Page/Payout và các tuyến quản lý liên quan phải chuyển sang successor; tuyến dưới không được tự động nhận quyền ngược lên tuyến trên.

Màn hình Payout đọc qua `/api/admin/access?endpoint=payout` để áp dụng cùng access context. Người quản lý chỉ thấy Page và hồ sơ Payout trực tiếp/kế thừa đã được cấp; một quyền Payout hợp lệ cũng mở phạm vi đọc cho các Page được liên kết với hồ sơ đó, không cần cấp trùng `page_access`. Không có `payment_profile_access` thì không thấy hồ sơ hoặc dữ liệu thanh toán. Các thao tác tạo/sửa/gắn/cấp quyền vẫn yêu cầu `platform_admin` hoặc `super_admin`.

Tuyến trên chỉ thấy dữ liệu tuyến dưới khi có membership active và không tự động có quyền ghi.

## Admin preview — đã triển khai có kiểm soát

`platform_admin`/`super_admin` có thể tạo phiên xem trước 15 phút qua `/api/admin/preview`. Mỗi request dùng session Supabase của quản trị viên kèm preview token ký server-side; server dựng access context của tài khoản đích, không dùng token của tài khoản đích. Chế độ này chỉ đọc, chặn các thao tác POST quản trị/đồng bộ, có banner và nút trở về góc nhìn quản trị viên. Mỗi lần bắt đầu được ghi vào `admin_audit_logs`.

Luồng khởi tạo phải đi từ nút **Xem trước** trên đúng dòng tài khoản ở `/users`. Nút gửi trực tiếp `user_id` và `user_email` tới endpoint (không suy diễn ID từ nội dung hiển thị), lưu token vào session storage và cookie 15 phút, rồi chuyển tới `/analytics?preview=1`. Nút không xuất hiện cho chính tài khoản quản trị viên đang đăng nhập; tài khoản `suspended`/`deleted` bị từ chối. Khi đang preview, banner cố định cho phép thoát và xóa cả token trong storage/cookie. Banner có vùng đệm cuối trang để không che bảng hoặc danh sách trên desktop/mobile; hai lớp banner global/runtime tự loại trùng.

