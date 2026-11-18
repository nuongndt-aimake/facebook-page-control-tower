# Fanpage Sales line

Trạng thái: **Thử nghiệm** — line bán hàng nằm trong Bảng Phong Thần, không có database hay hệ thống tài khoản riêng.

## Phân quyền và bàn giao

- Người mua đăng nhập Google qua Supabase Auth hiện có; profile được tạo theo luồng chuẩn.
- Admin dùng role `platform_admin`/`super_admin`; CTV/Inhouse dùng profile, trạng thái tài khoản và tuyến quản lý hiện hữu.
- Gán đơn lưu cả người xử lý và cấp quản lý. Khi offboard, migration/API tiếp theo phải chuyển gán đơn cùng Page, Payout, team và reporting line trước khi suspend/delete.
- Không cho client truy cập trực tiếp bảng sales; mọi đọc/ghi qua API server kiểm tra access context.

## Dữ liệu

- `sales_products`: danh mục dùng chung, hỗ trợ các loại sản phẩm tương lai.
- `sales_orders`: snapshot giá, người mua, trạng thái thanh toán và giao nhận.
- `sales_order_assignments`: người xử lý, quản lý và lịch sử bàn giao.
- `sales_payment_events`: webhook SePay idempotent.

## SePay

Public checkout giữ tắt cho đến khi sandbox webhook được kiểm thử. Không xác nhận thanh toán từ browser hoặc bill; chỉ webhook server-side được xác thực mới có thể đưa đơn sang `paid`.
