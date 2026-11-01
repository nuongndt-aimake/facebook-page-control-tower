# Quy ước bắt buộc của dự án

Các quy tắc dưới đây áp dụng cho mọi thay đổi trong repository, kể cả sửa code, database, API, UI, cấu hình, tài liệu và triển khai.

## 1. Cập nhật tài liệu cùng thay đổi

Mọi thay đổi được áp dụng hoặc deploy phải cập nhật tài liệu liên quan trong cùng commit hoặc cùng pull request. Tối thiểu phải kiểm tra:

- API/action và quyền truy cập;
- database/migration và dữ liệu tương thích;
- route/navigator/UI;
- cấu hình môi trường và deployment;
- test/runbook/roadmap nếu thay đổi ảnh hưởng vận hành.

## 2. Không xóa lịch sử tài liệu

Không xóa mô tả của chức năng, cấu hình hoặc quy ước cũ chỉ vì nó không còn hiệu lực. Chuyển sang trạng thái `Hết hiệu lực`, ghi ngày, lý do, thay thế bằng gì và liên kết tới commit/migration liên quan.

## 3. Đánh giá tác động liên thông

Trước khi sửa phải lập impact note: chức năng, màn hình, API, bảng dữ liệu, role, cron, domain và tài liệu nào bị ảnh hưởng. Nếu có ảnh hưởng thì phải cập nhật đồng bộ hoặc ghi rõ kế hoạch và blocker.

## 4. Tích hợp phân quyền bắt buộc

Chức năng/màn hình mới phải dùng access context/RBAC hiện có, có kiểm tra server-side, có RLS/migration phù hợp và có test cho user không được cấp quyền. Không bảo vệ bằng cách chỉ ẩn nút ở UI.

## 5. Khi thêm role/quyền mới

Phải lập ma trận role × chức năng, cập nhật tất cả màn hình/API/query liên quan, policy/RLS, navigator và tài liệu. Không được tạo role chỉ có hiệu lực ở một màn hình.

## 6. Responsive bắt buộc

Mọi màn hình mới hoặc thay đổi UI phải kiểm tra tối thiểu 390px, 768px và desktop; không overlap, không menu chìm, không ép bảng tràn ngang và không có kích thước label/button bất nhất.

Chi tiết quy trình xem tại [docs/change-governance.md](docs/change-governance.md).
