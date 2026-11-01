# Cấu hình và vận hành Meta/BM

Tài liệu này mô tả cách hệ thống kết nối tài khoản Meta, đọc Business Manager/Business Portfolio và Page, sau đó lưu registry để báo cáo. Quyền thực tế vẫn phụ thuộc Meta App Review và quyền của tài khoản authorize.

## 1. Mô hình kết nối

```text
Meta User OAuth
      │
      ▼
User Access Token (server-side)
      │
      ├─ /me/accounts
      ├─ {business_id}/owned_pages
      └─ {page_id}/insights, posts, metrics
```

Một `meta_connection` có `label`, `business_ids`, `page_ids` và `token_expires_at`. `user_access_token` chỉ được server sử dụng. Không nhầm User Access Token với Page Access Token: hệ thống dùng User token để discovery, lấy Page token trong serverless run và không trả Page token về browser.

## 2. Thiết lập Meta App

Trong Meta for Developers:

1. App Domains: `money.aiecom.vn`.
2. Valid OAuth Redirect URI:

```text
https://money.aiecom.vn/api/meta/callback
```

3. Cấu hình Privacy Policy và Terms URL bằng domain production.
4. Kiểm tra App Mode, người dùng test và App Review.
5. Quyền hiện dùng trong code:

```text
pages_show_list
pages_read_engagement
read_insights
business_management
```

Không tự kết luận rằng `business_management` là đủ để đọc payout/monetization; các quyền tài chính và metric kiếm tiền có thể bị Meta giới hạn riêng.

## 3. Luồng authorize và refresh connection

1. Người dùng đăng nhập Google/Supabase.
2. Mở `/api/meta/start`.
3. Server tạo state có nonce và user ID.
4. Meta trả `code` về `/api/meta/callback`.
5. Server đổi code lấy User Access Token.
6. Server lưu/cập nhật `meta_connections`.
7. Chạy `refresh_assets` để discovery BM/Page.
8. Kiểm tra `businesses`, `pages`, `page_connection_history`.

Khi có BM/Page mới, chạy làm mới connection/asset registry. Nếu token bị thu hồi hoặc hết hạn, authorize lại connection đó và giữ nguyên `pages.registry_id`.

## 4. Discovery BM và Page

Hệ thống resolve theo thứ tự:

1. `/me/accounts` để lấy Page người dùng quản trị trực tiếp.
2. `{business_id}/owned_pages` cho Page thuộc BM được cấu hình.
3. `page_ids` cấu hình bổ sung.
4. Với mỗi Page, lấy `access_token` trong server để dùng tạm thời.

Registry lưu Page ID, `registry_id`, tên, category, tasks, `asset_scope`, BM ID/name, connection, `first_connected_at`, `last_seen_at`, `last_synced_at` và trạng thái hiện tại. Nếu Page xuất hiện cả trong BM và `/me/accounts`, hợp nhất theo Meta Page ID; không tạo bản ghi trùng. Lịch sử nguồn vẫn ghi trong `page_connection_history`.

## 5. Phân biệt tài sản BM và ngoài BM

| Nhãn | Ý nghĩa |
| --- | --- |
| `bm` | Page resolve từ Business Portfolio/BM |
| `personal` | Page trả từ `/me/accounts`, chưa xác định BM custodian |
| `configured` | Page được chỉ định bằng `page_ids` |

UI phải hiển thị tên BM, không chỉ ID. Nếu Meta không trả tên BM, giữ ID và hiển thị `name_unavailable`, không đặt tên giả.

## 6. Đồng bộ dữ liệu

Phạm vi gồm registry BM/Page, connection history, bài đăng, Page insights, post insights và metric doanh thu/monetization khi Meta cấp quyền. Báo cáo đọc snapshot/metric đã lưu, không gọi Meta trực tiếp mỗi lần mở màn hình.

Các action hiện có của `POST /api/admin/access`:

```json
{"action":"refresh_assets"}
{"action":"sync","period":"day"}
{"action":"sync","period":"7d"}
{"action":"sync","period":"28d"}
{"action":"sync","period":"this_month"}
{"action":"sync","period":"last_month"}
{"action":"sync_page","page_id":"<META_PAGE_ID>"}
```

Phân loại kết quả: `ok`, `empty_success`, `permission_error`, `transient_error`, `not_applicable`. `permission_error` không được hiển thị thành doanh thu `0` hoặc trạng thái “chưa kiếm tiền”.

## 7. Lịch và giới hạn Vercel

Thiết kế mục tiêu có ba slot 06:00, 14:00, 22:00 giờ Việt Nam, mỗi slot có `active/inactive`. Migration control-plane đã tạo các bảng `sync_schedule_slots`, `sync_jobs`, `sync_attempts` và `sync_locks`, nhưng `vercel.json` hiện chỉ có cron một lần/ngày theo UTC. Dispatcher/worker chưa được bật production; cần kiểm tra migration, idempotency, retry/dead-letter, concurrency limit và quota Graph API trước khi bật. Khi Vercel chưa nâng cấp, chỉ bật slot phù hợp và ưu tiên sync Page được yêu cầu.

## 8. Retry và chẩn đoán

1. Đọc `sync_runs.summary` để biết Page nào lỗi.
2. Kiểm tra connection label và BM ID.
3. Kiểm tra token/debug quyền trên Meta.
4. Retry riêng Page bằng `sync_page`.
5. Nếu lỗi hàng loạt, tắt slot active và giữ snapshot cũ.
6. Sau khi authorize lại, chạy `refresh_assets`, rồi sync một Page kiểm chứng.

Không retry vô hạn lỗi `#200`, `#10`, token revoked hoặc lỗi review quyền. Chỉ retry timeout/429/5xx theo backoff.

## 9. Kiểm soát dữ liệu và bảo mật

- Không log User/Page Access Token.
- Không đưa token vào response, HTML, query string hoặc analytics event.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ server-side.
- `meta_connections.user_access_token` hiện là cột nhạy cảm trong DB; cần chuyển sang encryption/secret store trước khi mở rộng production.
- Mọi thay đổi BM/Page/connection phải giữ lịch sử và actor.
- Báo cáo lọc theo access context, không chỉ lọc bằng UI.

## 10. Checklist kết nối một BM mới

- [ ] Tài khoản Meta có quyền phù hợp trên BM.
- [ ] BM ID được thêm vào connection.
- [ ] OAuth authorize lại nếu token cũ không có BM scope.
- [ ] `refresh_assets` trả đúng BM name và danh sách Page.
- [ ] Page có `asset_scope=bm` và `custodian_business_id`.
- [ ] `page_connection_history` có bản ghi.
- [ ] Sync thử một Page.
- [ ] Kiểm tra Page ngoài BM không bị gộp nhầm vào BM.
- [ ] Gán Page cho nhóm/người/payout nếu cần.
