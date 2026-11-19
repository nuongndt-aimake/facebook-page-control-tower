# Runbook kho Fanpage — Gate 2.1

- Trạng thái: `Thử nghiệm`
- Route: `/inventory-fanpages`
- Cập nhật: 2026-11-19

## Quyền và thao tác

| Permission | Thao tác UI | Kiểm tra thực thi |
| --- | --- | --- |
| `sales_inventory.read` | Xem tồn kho, lọc trạng thái, thống kê kho Inhouse | `GET /api/admin/access?endpoint=sales_inventory` |
| `sales_inventory.intake` | Nhập một Page thành mã nháp | `POST action=intake` |
| `sales_inventory.publish` | Chuyển nháp sang sẵn sàng bán | `POST action=publish` |
| `reserve`, `release`, `finalize` | Chưa mở nút độc lập | Chỉ dùng trong luồng đơn/bàn giao có kiểm soát |

`platform_admin` và `super_admin` có đầy đủ quyền. Màn hình chỉ điều chỉnh khả năng nhìn thấy; API là chốt phân quyền cuối cùng. Tài khoản bị từ chối không nhận được dữ liệu kho.

## Quy trình vận hành

1. Mở **Vận hành → Kho Fanpage** và nhập ID/đường dẫn Page, giá nhập cùng thông tin nội bộ cần thiết.
2. Hệ thống tạo `FPINV-*` ở trạng thái `draft`; kiểm tra lại ID/link trước khi chọn **Mở bán**.
3. Không reserve/chốt bán/chuyển Inhouse thủ công tại màn hình này. Các bước đó bắt buộc gắn mã đơn hoặc luồng bàn giao để giữ ledger/audit nhất quán.
4. Không ghi token Meta, mật khẩu hoặc dữ liệu đăng nhập vào trường tham chiếu quản trị/BM.

## Kiểm tra trước khi dùng dữ liệu thật

- Tài khoản chỉ có `read` không thấy form nhập và API `POST intake` trả từ chối.
- Tài khoản có `intake` nhưng không có `publish` tạo được nháp nhưng không thấy nút mở bán.
- Kiểm tra Page ID và link trước khi mở bán; mã đã mở bán không quay về `draft` qua UI.
- Kiểm tra mobile 390px, tablet 768px và desktop: form không tràn, bảng chuyển card ở mobile và menu mở/đóng được.

## Phụ thuộc còn lại

- Fixture kiểm thử cạnh tranh reserve/release/finalize và negative RBAC.
- UI kho Inhouse, gán tài sản và bàn giao có xác nhận.
- Thời hạn reserve, người được release và quy tắc chuyển Inhouse cần quyết định nghiệp vụ chính thức.
