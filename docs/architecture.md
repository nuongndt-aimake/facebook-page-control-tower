# Kiến trúc hệ thống

```text
Google OAuth / Meta OAuth
          │
          ▼
      Supabase Auth
          │
          ▼
Vercel API ──► Meta Graph API
    │              │
    │              ▼
    └──────────► Supabase Database
                       │
                       ▼
              Snapshot / Report API
                       │
                       ▼
                 HTML + JS UI
```

## Ranh giới trách nhiệm

- Browser: hiển thị, lọc, phân trang và gọi API có xác thực.
- Vercel API: xác thực, kiểm tra quyền, gọi Meta, ghi Database.
- Supabase Auth: Google login, session và trạng thái tài khoản.
- Supabase Database: registry, queue, snapshot, audit và phân quyền.
- Meta: nguồn dữ liệu bên ngoài; không phải nguồn báo cáo trực tiếp sau khi snapshot.

Chi tiết module và boundary triển khai xem [module-map.md](module-map.md). Không tạo Function riêng cho từng màn hình; màn hình mới phải gắn vào module nghiệp vụ và navigator hiện có.

## Luồng đồng bộ chuẩn

1. Scheduler kiểm tra slot active.
2. Tạo `sync_run` có `slot_key` và idempotency key.
3. Làm mới connection/BM/Page registry.
4. Tạo job cho từng Page và từng loại dữ liệu.
5. Worker lấy job theo giới hạn concurrency.
6. Lưu raw result, metric, snapshot và attempt log.
7. Báo cáo đọc dữ liệu đã lưu.

