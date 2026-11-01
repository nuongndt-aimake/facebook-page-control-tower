# Frontend và UX

## Các màn hình chính

| Route | File | Mục đích |
| --- | --- | --- |
| `/` | `index.html` | Landing/điểm vào |
| `/analytics` | `analytics.html` | Tổng quan và báo cáo |
| `/report-pages` | `report-pages.html` | Báo cáo Page |
| `/report-content` | `report-content.html` | Bài đăng và metric nội dung |
| `/report-revenue` | `report-revenue.html` | Doanh thu |
| `/payout` | `payout.html` | Hồ sơ payout và quyền tài chính |
| `/team` | `team.html` | Gán, tìm kiếm và kết thúc tuyến quản lý–nhân viên |
| `/commissions` | `commissions.html` | Chia sẻ hoa hồng |
| `/groups` | `groups.html` | Danh mục cấp 1/cấp 2 và gán Page |
| `/users` | `users.html` | Nhân sự, role, tuyến quản lý |
| `/access` | `access.html` | Tài sản, BM và phân quyền |
| `/connect-meta` | `connect-meta.html` | OAuth Meta và connection |
| `/account` | `account.html` | Tài khoản và session |

`auth-nav.js` là nguồn duy nhất cho navigator. Không tự thêm menu riêng ở từng HTML. Khi thêm route, cập nhật menu, mobile menu, active state và bảng route ở tài liệu này.

## Quy ước UI

- Khu vực thao tác và khu vực dữ liệu/báo cáo phải tách rõ.
- Nhãn kỹ thuật chỉ hiện trong tooltip/help hoặc trang vận hành, không rải trong màn hình báo cáo.
- Kỳ dữ liệu luôn hiển thị cạnh bảng/biểu đồ.
- Button, input, label dùng token kích thước chung trong `system.css`.
- Chart phải có container có chiều cao tối thiểu, legend không chồng dữ liệu.
- Mobile dùng card, accordion và bottom/overlay menu; không dùng bảng cố định gây tràn ngang.

## Dữ liệu hiển thị

Frontend chỉ hiển thị snapshot/API response đã được server lọc theo access context. Không suy ra quyền từ query string hoặc `localStorage`. Bộ lọc chỉ thay đổi dữ liệu đang hiển thị, không thay đổi dữ liệu gốc.
