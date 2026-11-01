# Cấu trúc dự án

Các route HTML hiện vẫn nằm ở root để giữ URL production tương thích. Không tự ý chuyển chúng vào thư mục khác nếu chưa thêm rewrite tương ứng.

```text
/
├─ api/                         # Vercel serverless API
│  ├─ _lib.mjs                  # Auth context, Supabase REST, Meta Graph helpers
│  ├─ auth/                     # Profile/session API
│  ├─ admin/                    # Admin, assignment, payout, user management
│  ├─ meta/                     # OAuth Meta start/callback
│  ├─ cron/                     # Scheduler entrypoint và worker trigger
│  └─ analytics.mjs             # Read-only reporting API
├─ supabase/
│  ├─ migrations/               # Migration bất biến, chạy theo timestamp
│  └─ schema.sql                # Schema tham khảo/bootstrap
├─ assets/                      # Asset tĩnh được dùng bởi giao diện
├─ docs/                        # Tài liệu dự án
├─ *.html                       # Route tĩnh production hiện tại
├─ auth-nav.js                  # Navigator dùng chung
├─ analytics-runtime.js         # Runtime báo cáo và OAuth/session
├─ system.css                   # Design tokens và responsive rules
├─ vercel.json                  # Rewrite và cron production
└─ .env*                        # Chỉ local; không commit
```

## Khi thêm chức năng

- API mới đặt trong `api/<domain>/`.
- Migration mới đặt trong `supabase/migrations/<timestamp>_<name>.sql`.
- Logic dùng chung đưa vào `api/_lib.mjs`, không copy giữa endpoint.
- UI dùng chung đưa vào `auth-nav.js`/`system.css`.
- Báo cáo mới phải có nguồn dữ liệu, kỳ dữ liệu và quyền truy cập rõ ràng.

