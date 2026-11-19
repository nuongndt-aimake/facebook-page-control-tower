# Sự cố PGRST204 khi tạo đơn — 2026-11-19

Trạng thái: Đã sửa trên Supabase production tlcjcqqnfjrqsoiaalfk.

Impact note: API checkout ghi snapshot chiết khấu nhưng sales_orders thiếu gross_amount_vnd, discount_percent, discount_amount_vnd. UI, role, RLS, cron, domain và SePay không thay đổi. Bảng hóa đơn và discount tiers đã tồn tại; không chạy lại toàn bộ migration hoặc xóa dữ liệu.

Đã đối chiếu migration 20261119150000_sales_discount_and_invoices.sql, bổ sung ba cột trong transaction, discount_percent mặc định 0 với check 0–100; discount_amount_vnd mặc định 0 với check >=0. Backfill gross_amount_vnd từ quantity * unit_price_vnd cho các bản ghi thiếu, rồi đặt NOT NULL. Giữ nguyên số tiền phải thanh toán của đơn cũ. Đã gửi NOTIFY pgrst, 'reload schema'.

SQL kiểm tra sau sửa xác nhận đủ ba cột: bigint/integer/bigint, đều NOT NULL. Không tạo đơn giả hoặc giao dịch tiền thật. Cần khách thử lại thao tác tạo đơn để xác nhận toàn bộ checkout qua API.

Runbook: trước phát hành checkout, đối chiếu toàn bộ cột trong payload API với information_schema.columns của production, không chỉ dựa vào sự tồn tại của bảng hoặc file migration. Nếu migration đã áp dụng một phần, kiểm tra trước và chỉ sửa additive phần thiếu trong transaction. Không bỏ trường snapshot khỏi API để che lỗi schema.
