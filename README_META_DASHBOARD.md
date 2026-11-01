# Meta Page Control Tower

Công cụ cục bộ này lấy **nội dung và chỉ số organic** của các Facebook Page bạn quản trị, kể cả Page nằm trong Business Portfolio/BM nếu tài khoản cấp token có đúng quyền. Dữ liệu được lưu trong `data/meta_dashboard/dashboard.sqlite3`; token không được gửi đến nơi nào ngoài Meta Graph API.

## Điều công cụ làm được

- Lấy danh sách Page mà tài khoản Facebook/token có thể truy cập.
- Đồng bộ bài viết trong một khoảng ngày và chỉ số ở cấp Page/bài viết.
- Chạy hằng ngày cho nhiều Page; từng chỉ số bị Meta ngừng hỗ trợ sẽ chỉ thành cảnh báo, không làm hỏng lượt đồng bộ còn lại.
- Xuất danh sách bài thành CSV UTF-8 để mở bằng Excel.

**Không lấy doanh thu kiếm tiền một cách đáng tin cậy.** Meta không mở một API Page công khai, ổn định để đọc toàn bộ doanh thu Stars/Content Monetization của Page hoặc hồ sơ Professional mode. Hãy coi Professional Dashboard/Business Suite là nguồn đối soát tiền; phần này nên nhập tay hoặc qua file export chính chủ.

## Thiết lập Meta (làm một lần)

1. Vào [Meta for Developers](https://developers.facebook.com/apps/), tạo/chọn Meta App và bật Facebook Login.
2. Trong lúc phát triển, thêm Facebook account của bạn vào vai trò của App. Khi dùng cho người khác hoặc nhiều người ngoài vai trò App, gửi App Review/Business Verification theo yêu cầu Meta.
3. Tạo **long-lived User Access Token** với tối thiểu `pages_show_list`, `pages_read_engagement`, `read_insights`. Với Page thuộc Business Portfolio, tài khoản cấp token phải có Page task `ANALYZE`; tùy cấu hình BM có thể cần thêm `business_management` để thấy Page.
4. Sao chép `.env.meta.example` thành `.env.meta`, rồi dán token vào `META_USER_ACCESS_TOKEN`. Đừng dán token vào chat hoặc commit Git.

Tài liệu: [Page API](https://developers.facebook.com/docs/graph-api/reference/page/), [Access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/), [Permissions reference](https://developers.facebook.com/docs/permissions/reference/).

## Chạy

Trong PowerShell, tại thư mục dự án:

```powershell
Copy-Item .env.meta.example .env.meta
notepad .env.meta
python .\meta_page_dashboard.py discover
python .\meta_page_dashboard.py pages
python .\meta_page_dashboard.py sync
python .\meta_page_dashboard.py export-posts
```

`sync` mặc định lấy ngày hôm qua. Ví dụ lấy một Page trong 7 ngày:

```powershell
python .\meta_page_dashboard.py sync --page-id 123456789 --since 2026-09-17 --until 2026-09-24
```

File xuất mặc định: `data/meta_dashboard/posts.csv`.

## Chạy tự động mỗi ngày trên Windows

Mở **Task Scheduler** → Create Task → Trigger: Daily → Action: Start a program.

- Program: đường dẫn tới `python.exe` của bạn.
- Arguments: `"C:\Users\ADMIN\Documents\KIẾM TIỀN FACEBOOKVIEW\meta_page_dashboard.py" sync`
- Start in: `C:\Users\ADMIN\Documents\KIẾM TIỀN FACEBOOKVIEW`

Sau khi tạo task, chạy thử bằng tay và xem bảng `sync_log` trong SQLite nếu cần chẩn đoán. Token hết hạn hoặc quyền Page thay đổi thì chạy lại `discover` sau khi cập nhật `.env.meta`.
