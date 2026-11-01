# Hướng dẫn đóng góp

## Quy trình

1. Đọc `AGENTS.md` và [change-governance.md](docs/change-governance.md).
2. Tạo branch theo dạng `codex/<mo-ta-ngan>`.
3. Viết impact note trước khi sửa.
4. Không sửa trực tiếp production để thử nghiệm.
5. Với Database, luôn tạo migration mới; không sửa migration đã chạy.
6. Cập nhật code, quyền, tài liệu và UI liên quan trong cùng thay đổi.
7. Chạy kiểm tra cú pháp, smoke test và responsive QA trước khi mở pull request.
8. Ghi rõ ảnh hưởng tới Auth, Meta API, Supabase, Vercel, mobile và desktop.

## Checklist trước khi merge

- Không có secret hoặc token trong diff.
- `node --check` pass với các file API/runtime đã sửa.
- Có kiểm thử quyền truy cập tương ứng.
- Có kiểm thử dữ liệu rỗng, lỗi Meta và retry.
- Không tạo navigator hoặc bộ lọc trùng trên giao diện.
- Mobile không bị overflow hoặc overlap.
- Migration có index, RLS và rollback note.
- Chức năng/màn hình mới đã tích hợp RBAC và access context.
- Role/quyền mới đã được rà soát trên toàn bộ màn hình/API hiện có.
- Mục cũ không bị xóa khỏi tài liệu; nếu không còn dùng đã đánh dấu `Hết hiệu lực`.
- Impact note đã nêu rõ các nơi bị ảnh hưởng hoặc kế hoạch cập nhật tiếp theo.

## Quy tắc commit

Sử dụng prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `migration:`, `ops:`.

