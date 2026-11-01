# Tài liệu dành cho lập trình viên mới

Đọc theo thứ tự:

1. `project-structure.md` — vị trí mã nguồn.
2. `architecture.md` — luồng dữ liệu và ranh giới hệ thống.
3. `database.md` — bảng, khóa, migration và snapshot.
4. `meta-sync.md` — connection, token, queue và lịch đồng bộ.
5. `security-permissions.md` — Auth, RBAC, RLS và admin preview.
6. `reporting.md` — Page, nội dung, doanh thu, payout.
7. `deployment.md` — biến môi trường, OAuth và phát hành.
8. `runbook.md` — vận hành, chẩn đoán và rollback.
9. `roadmap.md` — phần đã có, phần đang nâng cấp và tiêu chí nghiệm thu.

## Quy tắc quan trọng

- `pages.id` là Meta Page ID; `pages.registry_id` là định danh nội bộ bất biến.
- Không lưu Page Access Token trong Database.
- `sync_runs` chỉ là lịch sử phiên; dữ liệu báo cáo phải đọc từ snapshot/metric đã lưu.
- Quyền tài chính không đồng nghĩa với quyền quản trị Page.
- Admin preview chỉ đọc và phải được audit.

