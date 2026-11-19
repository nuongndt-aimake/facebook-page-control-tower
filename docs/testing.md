# Kiểm thử và nghiệm thu

## Kiểm tra cú pháp

Project là frontend HTML/JS và Vercel Functions, không có test runner bắt buộc. Chạy tối thiểu:

```powershell
Get-ChildItem api -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --check analytics-runtime.js
node --check auth-nav.js
node --check report-sections.js
```

## Kiểm tra cấu trúc tài liệu/liên kết

```powershell
rg -n '\]\(([^)#]+)\)' README.md CONTRIBUTING.md docs
```

Mọi liên kết nội bộ phải tồn tại; không link tới `.env`, token, URL preview hoặc file dữ liệu cá nhân.

## Smoke test API

1. Đăng nhập Google trên production.
2. Mở `/api/auth/profile` bằng session hiện tại.
3. Mở báo cáo và xác nhận không có request Graph từ browser.
4. Chạy sync một Page, sau đó kiểm tra `sync_runs`, `pages`, `posts`, `metrics`.
5. Tạo một lỗi quyền giả lập hoặc Page không có token và xác nhận các Page khác vẫn hoàn thành.
6. Kiểm tra `401`, `403`, `400` bằng request thiếu/không hợp lệ.
7. Với line bán hàng: platform admin mở `/sales-orders`, phân công một đơn rồi kiểm tra `admin_audit_logs`; thử một account không phải admin nhận `403` từ `/api/admin/sales-orders`.
8. Với SePay Test Mode: tạo đơn tại `/sales` bằng mã `INHOUSE` (kỳ vọng 10.000 đ), dùng nội dung chuyển khoản chính xác `FSXXXXXXXXXX`; chỉ chuyển `paid` khi webhook đúng token, đúng mã và đúng số tiền; gửi lại cùng event để xác nhận không tạo thanh toán trùng. Không dùng giao dịch tiền thật trong bài test này.
9. Với checkout: kiểm tra nút tải QR trả tệp PNG chỉ cho mã `FS` hợp lệ; đồng hồ đếm từ 15:00 dựa trên `payment_expires_at`. Webhook đến sau hạn không được tự chuyển đơn sang `paid` mà ghi event `expired` và chuyển đơn sang cần đối soát.

### Nghiệm thu 2026-11-19

- **Đạt:** webhook Test Mode → Production trả HTTP 200.
- **Đạt:** tạo đơn public `FS8BD4948AE3` với `INHOUSE`, số tiền QR 10.000 đ.
- **Đạt:** mô phỏng tiền vào 10.000 đ với nội dung đúng mã; SePay xác nhận và trang `/sales-orders` ghi `paid`.
- **Chưa chạy:** kiểm tra gửi lại cùng `provider_event_id` ở giao diện Test Mode. Code đã có khóa unique/idempotency; cần chạy lại khi cần chứng minh thao tác vận hành này.
- **Đạt (Live):** SePay webhook #73924 tới `https://money.aiecom.vn/api/payments/sepay` trả `HTTP 200` qua callback thử sau khi đồng bộ Production Secret và redeploy `dpl_86RZRcYnzfrvLERJh1EmTbtMkGd4`.
- **Chưa chạy (Live):** giao dịch tiền thật đầu tiên. Không thực hiện tự động; khi có giao dịch do khách hàng tạo, xác nhận mã đơn, số tiền, trạng thái `paid` và event idempotency trong `/sales-orders`.
- **UI V3:** kiểm tra `/sales` phải giữ bố cục Fanpage Sales V3 ở desktop, 768px và 390px: tab không che nội dung, hai thẻ chuyển về một cột trên mobile, nhãn/nút không tràn và QR vẫn tải được sau khi tạo đơn.

## Ma trận quyền tối thiểu

## Sales Platform test gate (Roadmap)

- Hai request reserve cùng một mã Page: chỉ một request thành công.
- Huỷ/hết hạn đơn trả mã Page về đúng kho tổng; transfer Inhouse không tạo lại tồn kho tổng.
- User không được chỉ định không xác minh được đơn 0đ hoặc xem Page/kho ngoài scope.
- Hai assignment cùng Page có báo cáo và hoa hồng riêng; tổng Page đúng, tổng nhân sự không lẫn nhau.
- Manager nhìn thấy direct/inherited theo access context nhưng quyền lợi chưa duyệt không bị cộng vào payout.
- Google Sheet connector chỉ gọi read API; kiểm thử không có request ghi/update.
- Kiểm thử 390px, 768px, desktop cho kho, đơn, dashboard và menu overlay.

| Vai trò | Đọc Page | Đọc nội dung | Đọc doanh thu | Đọc payout | Sync Page | Quản lý user |
| --- | --- | --- | --- | --- | --- | --- |
| viewer | được gán | được gán | không mặc định | không mặc định | không | không |
| analyst | được gán | được gán | được gán | theo cấp | không | không |
| operator | được gán | được gán | được gán | theo cấp | Page được gán | không |
| manager | tuyến dưới | tuyến dưới | tuyến dưới | theo access | Page tuyến dưới | hạn chế |
| platform_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |
| super_admin | tất cả | tất cả | tất cả | tất cả | tất cả | tất cả |

`/api/admin/sales-orders` và `/sales-orders` chỉ dành cho `platform_admin`/`super_admin`; người phụ trách đơn không có quyền tự xem dữ liệu checkout qua API này. Checkout public sẽ có endpoint riêng sau khi được bật có kiểm soát.

## Responsive QA

Kiểm tra ít nhất 390px, 768px và desktop:

- menu mở được và nổi trên nội dung (`z-index` đúng);
- không có overlap header, label, chart hoặc button;
- bảng lớn chuyển thành card/list trên mobile, không ép cuộn ngang;
- bộ chọn nhiều có search, chọn tất cả, bỏ chọn tất cả, bộ đếm và lọc đang chọn;
- mọi màn hình có navigator thống nhất.

## Tiêu chí không đạt

- Có lỗi console chưa giải thích.
- Dữ liệu kỳ này hiển thị chung với kỳ khác.
- Dữ liệu rỗng bị trình bày như request thành công.
- Người không có payout access thấy số tiền.
- Token/secret xuất hiện trong HTML, response hoặc log.
