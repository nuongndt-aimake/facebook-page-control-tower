# Hướng dẫn đóng góp

## Quy trình

1. Tạo branch theo dạng `codex/<mo-ta-ngan>`.
2. Đọc tài liệu liên quan trước khi sửa.
3. Không sửa trực tiếp production để thử nghiệm.
4. Với Database, luôn tạo migration mới; không sửa migration đã chạy.
5. Chạy kiểm tra cú pháp và smoke test trước khi mở pull request.
6. Ghi rõ ảnh hưởng tới Auth, Meta API, Supabase và Vercel.

## Checklist trước khi merge

- Không có secret hoặc token trong diff.
- `node --check` pass với các file API/runtime đã sửa.
- Có kiểm thử quyền truy cập tương ứng.
- Có kiểm thử dữ liệu rỗng, lỗi Meta và retry.
- Không tạo navigator hoặc bộ lọc trùng trên giao diện.
- Mobile không bị overflow hoặc overlap.
- Migration có index, RLS và rollback note.

## Quy tắc commit

Sử dụng prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `migration:`, `ops:`.

