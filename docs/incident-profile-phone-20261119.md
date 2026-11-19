# Khắc phục schema `profiles.phone` — 2026-11-19

- Trạng thái: `Đã xử lý`
- Ảnh hưởng: các API đọc hồ sơ hoặc checkout có thể nhận lỗi Postgres `42703` vì `profiles.phone` chưa có ở production.
- Nguyên nhân: migration `20261119150000_sales_discount_and_invoices.sql` đã có thay đổi schema này trong repository, nhưng cột chưa tồn tại ở database production.

## Khắc phục

Đã chạy tại Supabase production:

```sql
alter table public.profiles add column if not exists phone text;
```

Lệnh là additive/idempotent, không thay đổi hoặc xóa dữ liệu hiện hữu. Truy vấn `information_schema.columns` sau đó trả đúng cột `phone`.

## Phòng ngừa

1. Trước deploy code đọc cột mới, kiểm tra migration đã có trên production và xác nhận schema bằng query read-only.
2. Migration production phải được ghi trạng thái trong tài liệu deploy cùng commit có thay đổi API/UI phụ thuộc.
3. API tiếp tục không cấp client quyền đọc/ghi trực tiếp `profiles.phone`; chỉ server xác thực được cập nhật số này qua checkout.
