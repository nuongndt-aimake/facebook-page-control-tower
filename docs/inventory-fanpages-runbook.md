# Runbook kho Fanpage — Gate 2.1

## Hiệu lực mới — 2026-11-19, Gate 2.2

Luồng nhập nhiều request bên dưới **Hết hiệu lực** từ migration `20261119210000_sales_inventory_transaction_fulfillment.sql`: thay bằng RPC transaction; trùng ID chuẩn hóa hoặc lỗi detail/ledger/audit đều rollback toàn bộ. Lịch sử được giữ để truy vết. Chi tiết API, quyền và nghiệm thu tại [bản phát hành kho và bàn giao](inventory-fulfillment-release-20261119.md).

- `/inventory-fanpages`: nhập nháp, sửa tên, mở bán và xem lịch sử từng mã.
- `/sales-orders` → **Kho & bàn giao**: giữ mã đúng sản phẩm/số lượng, trả mã có lý do, xác minh 0đ, chốt bàn giao. Nhân viên có scope và được giao đơn hoặc có `sales_orders.read_all`.
- Checkout tạo đơn, hóa đơn và giữ kho FIFO cùng transaction; thiếu hàng trả 409 và không tạo đơn dở dang. Đơn cũ chưa gắn mã phải giữ đủ mã trước khi chốt.
- Bán ngoài: `reserved → external_sold`. Inhouse: đơn 0đ được nhân viên xác minh rồi mới chốt; `reserved → inhouse_transferred`, tạo Page registry nguồn `sales_inventory` và kho Inhouse, không đồng bộ Meta.
- `/inventory-inhouse`: tạo đơn 0đ (nhân viên có `finalize`), xem kho/phân công, giao nhân sự có `assign_inhouse`; không cấp quyền Facebook thật.
- Huỷ đơn chưa trả giải phóng mã, huỷ đơn và hóa đơn cùng transaction. Đơn paid/completed cần đối soát. Chưa có cron tự trả mã; dùng trả mã có lý do sau đối soát.
- Ghi chú “chưa mở nút”, “UI Inhouse còn thiếu” phía dưới là lịch sử Gate 2.1, **Hết hiệu lực** trong phạm vi trên. Bảng dùng cuộn ngang trong khung theo yêu cầu mới, không ẩn cột.

Bổ sung 2026-11-19: nhập mới bắt buộc Tên Page hiện tại; các mã cũ có nút Cập nhật tên dùng quyền intake và audit server. Bảng giữ từng trường thành một cột, scroll ngang trong khung trên mobile, không tự ẩn cột. Xem [migration và kiểm thử](parallel-upgrade-20261119.md). Luồng nhập kho nhiều bước hiện hữu chưa được chuyển sang RPC transaction trong bản bổ sung này.

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

1. Quản trị viên mở **Nhân sự → Quyền → Kho Fanpage** để cấp đúng scope cho nhân sự; sau đó nhân sự mở **Vận hành → Kho Fanpage**.
2. Nhập ID/đường dẫn Page, giá nhập cùng thông tin nội bộ cần thiết.
3. Hệ thống tạo `FPINV-*` ở trạng thái `draft`; kiểm tra lại ID/link trước khi chọn **Mở bán**.
4. Không reserve/chốt bán/chuyển Inhouse thủ công tại màn hình này. Các bước đó bắt buộc gắn mã đơn hoặc luồng bàn giao để giữ ledger/audit nhất quán.
5. Không ghi token Meta, mật khẩu hoặc dữ liệu đăng nhập vào trường tham chiếu quản trị/BM.

## Kiểm tra trước khi dùng dữ liệu thật

- Tài khoản chỉ có `read` không thấy form nhập và API `POST intake` trả từ chối.
- Tài khoản có `intake` nhưng không có `publish` tạo được nháp nhưng không thấy nút mở bán.
- Kiểm tra Page ID và link trước khi mở bán; mã đã mở bán không quay về `draft` qua UI.
- Kiểm tra mobile 390px, tablet 768px và desktop: form không tràn, bảng chuyển card ở mobile và menu mở/đóng được.

## Phụ thuộc còn lại

- Fixture kiểm thử cạnh tranh reserve/release/finalize và negative RBAC.
- UI kho Inhouse, gán tài sản và bàn giao có xác nhận.
- Thời hạn reserve, người được release và quy tắc chuyển Inhouse cần quyết định nghiệp vụ chính thức.
