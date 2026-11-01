# AI/FB MONEY

Hệ thống quản lý Page Facebook, đồng bộ nội dung/metric, báo cáo doanh thu, payout, hoa hồng và phân quyền người dùng.

## Bắt đầu nhanh

1. Đọc [docs/README.md](docs/README.md).
2. Đọc [docs/project-structure.md](docs/project-structure.md) để biết file nào thuộc lớp nào.
3. Cấu hình biến môi trường theo [docs/deployment.md](docs/deployment.md).
4. Chạy migration Supabase theo thứ tự trong `supabase/migrations/`.
5. Kiểm tra ứng dụng local trước khi deploy.

## Tài liệu chính

- [Kiến trúc hệ thống](docs/architecture.md)
- [Cấu trúc dự án](docs/project-structure.md)
- [Database và migration](docs/database.md)
- [Kết nối Meta và đồng bộ](docs/meta-sync.md)
- [Auth, RBAC và admin preview](docs/security-permissions.md)
- [Báo cáo Page, nội dung, doanh thu và payout](docs/reporting.md)
- [Lộ trình triển khai](docs/roadmap.md)
- [Runbook vận hành](docs/runbook.md)
- [API reference](docs/api-reference.md)
- [Cấu hình môi trường](docs/configuration.md)
- [Frontend và UX](docs/frontend.md)
- [Kiểm thử](docs/testing.md)
- [Checklist phát hành](docs/release-checklist.md)
- [Hướng dẫn cài đặt và kết nối](docs/installation.md)
- [Cấu hình và vận hành Meta/BM](docs/meta-bm-operations.md)
- [Hướng dẫn đóng góp](CONTRIBUTING.md)

## Nguyên tắc an toàn

- Không commit `.env`, Meta token, Supabase service-role key hoặc dữ liệu production.
- Không gọi Meta trực tiếp từ trình duyệt.
- Báo cáo đọc snapshot trong Supabase; đồng bộ là một tác vụ riêng.
- Mọi thay đổi Database phải có migration và kế hoạch rollback.

## Production

- Frontend/API: Vercel.
- Database/Auth: Supabase.
- Domain production: `https://money.aiecom.vn`.

