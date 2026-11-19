# Nhật ký triển khai nền tảng bán hàng

## Gate 1 — nền dữ liệu, kiểm soát kho và báo cáo

- Trạng thái: `Thử nghiệm`
- Bắt đầu: 2026-11-19
- Migration: `supabase/migrations/20261119193000_sales_inventory_and_reporting_foundation.sql`
- Commit triển khai: `c07dea5` — `feat: add sales inventory foundation` (đã rebase sau các commit sales trên `main`)
- Phạm vi: dữ liệu và transaction server-side; chưa mở menu, checkout, QR hay bán công khai.
- Triển khai: đã áp dụng trên Supabase production ngày 2026-11-19; chưa cấp dữ liệu kho hay mở quyền client.

### Impact note

| Vùng | Tác động Gate 1 |
| --- | --- |
| Chức năng | Tạo nguồn sự thật cho kho Page tổng, chuyển kho Inhouse và báo cáo theo assignment. Luồng Meta sync không đổi. |
| API | Chưa có endpoint công khai. Ba RPC chỉ dành cho `service_role`: reserve, release, finalize. Sales API sau này phải xác thực/RBAC trước khi gọi. |
| Database | Bổ sung catalog 4 nhóm, kho Page, chi tiết Page, kho Inhouse, ledger, báo cáo/chính sách hoa hồng và metadata Google Sheet. Không đổi hay xoá dữ liệu cũ. |
| Phân quyền | Không thêm role. Mọi bảng Gate 1 bật RLS, thu hồi quyền `anon`/`authenticated`; không có policy client. |
| UI/menu | Chưa đổi navigator để không đưa người dùng vào luồng chưa hoàn chỉnh. Target menu ở `sales-platform-design.md`. |
| Responsive | Không có UI mới; kiểm thử 390/768/desktop bắt buộc từ Gate 2. |
| Tích hợp | Không gọi Meta, SePay, Google Sheet, Vercel hoặc DNS. Google Sheet mới lưu metadata, chưa có importer. |
| Dữ liệu | Không cần backfill. Nhập kho và liên kết `pages` thực hiện ở Gate 2 qua API có audit. |
| Tài liệu | Cập nhật log này, roadmap và testing cùng migration. |

### Bất biến dữ liệu

1. Một Page vật lý có đúng một item/mã kho.
2. Chỉ item `available` mới reserve được; transaction khoá hàng trước khi đổi trạng thái.
3. Release/finalize bắt buộc trùng mã đơn đang reserve.
4. Bán ngoài không quay lại kho tổng; chuyển Inhouse ghi kho Inhouse trong cùng transaction.
5. Báo cáo là theo assignment/ngày; tổng Page là phép cộng các assignment, không thay thế kết quả cá nhân.
6. Kết quả hoa hồng gắn phiên bản chính sách cụ thể, không bị thay đổi ngầm khi chính sách được sửa.

### Điều kiện nghiệm thu trước Gate 2

- [x] Áp dụng migration tại Supabase production.
- [x] Xác nhận 8 bảng nghiệp vụ mới đều bật RLS; quyền client bị thu hồi.
- [x] Xác nhận ba RPC kho chỉ còn `service_role` và `postgres` có quyền thực thi.
- [ ] Hai request reserve cùng mã Page: chỉ một thành công.
- [ ] Release/finalize sai mã đơn bị từ chối.
- [ ] Browser user không đọc/ghi Gate 1 hay gọi RPC.
- [ ] Chuyển Inhouse cần Page registry hợp lệ và không thể quay về kho tổng.
- [ ] Hai assignment chung Page có báo cáo và hoa hồng độc lập.

### Phụ thuộc chưa chốt

- Thời hạn tự hết reserve và người/phòng ban được phép release.
- Công thức đơn giá/bài, tỷ lệ doanh thu, nguồn doanh thu đủ điều kiện và cấp duyệt payout.
- Cấu trúc Google Sheet, tài khoản Google kết nối và quyền đọc tối thiểu.
- Chính sách giá/chiết khấu/khuyến mại được cấu hình trong admin cho Gate 3.

## Gate 2 — API kho quản trị

- Trạng thái: `Thử nghiệm`
- API: `GET/POST /api/admin/access?endpoint=sales_inventory` (được gộp vào function admin hiện có để phù hợp giới hạn Vercel Hobby).
- Quyền: RBAC chủ động trong `profiles.permissions.sales_inventory`; kiểm tra trên server, không dựa vào nút UI. `platform_admin`/`super_admin` có toàn quyền mặc định.
- Chức năng: xem kho; nhập nháp Page; mở bán mã nháp; gọi RPC reserve/release/finalize có khoá hàng; ghi `admin_audit_logs`.
- Lưu ý: nhập kho hiện là luồng nhiều ghi bản ghi; chỉ mở bán được sau khi có đầy đủ chi tiết Page. Gate 2.1 sẽ chuyển thao tác nhập kho vào một RPC transaction trước khi cấp cho vai trò nhân viên sale.

| Vùng | Tác động Gate 2 |
| --- | --- |
| API | Thêm endpoint admin nội bộ; không có thay đổi public checkout. |
| Phân quyền | Quyền tách theo `read`, `intake`, `publish`, `reserve`, `release`, `finalize`; preview bị chặn khi ghi; không thêm role mới. |
| Database | Chỉ dùng bảng/RPC Gate 1; không thêm migration. |
| UI/menu | Mô tả **Hết hiệu lực từ 2026-11-19**: endpoint đã có UI `/inventory-fanpages` và menu **Kho Fanpage** trong Vận hành; UI chỉ hiện action theo permission, API vẫn kiểm tra server-side. Route thử `/inventory/fanpages` không resolve trên Vercel và đã được thay thế trước phát hành bởi route tĩnh này. |
| Kiểm thử | Đã chạy syntax/link check UI; còn cần fixture cho reserve đồng thời và negative RBAC trước deploy. |

## Điều hướng liên khu — giới thiệu, mua hàng, quản lý

- Trạng thái: `Đang dùng`
- Cập nhật: 2026-11-19
- Phạm vi: `/`, `/lo-trinh`, `/sales` và các màn hình quản lý sử dụng `auth-nav.js`.

### Impact note

| Vùng | Tác động |
| --- | --- |
| Chức năng | Từ giới thiệu đi được tới mua Fanpage và quản lý; từ khu quản lý quay lại được hai khu công khai. Không đổi luồng đặt hàng. |
| API/Database | Không thay đổi. |
| Phân quyền | Liên kết `/analytics`, `/sales-orders` vẫn bị kiểm tra session/RBAC bởi API; hiển thị link không cấp quyền. |
| UI | Menu chung thêm **Giới thiệu** và **Mua Fanpage**; menu mua hàng và hai trang giới thiệu có điểm nối tương ứng. Không liên kết trang kho thử nghiệm vì chưa có UI nghiệm thu. |
| Responsive | Các liên kết dùng thanh menu hiện có: menu nhóm ở khu quản lý và tab cuộn ngang ở trang mua; cần QA 390px/768px/desktop sau deploy. |
| Tích hợp/Dữ liệu | Không ảnh hưởng Supabase, SePay, Meta, DNS hay cron. |

## Điều chỉnh menu theo hành trình tài khoản

- Trạng thái: `Đang dùng`
- Cập nhật: 2026-11-19

| Vùng | Tác động |
| --- | --- |
| UI/menu | Không đăng nhập: cuối menu là **Đăng nhập → Đăng ký**. Đã đăng nhập: cuối menu là **Tài khoản** (gồm Tài khoản, Đơn hàng) rồi **Đăng xuất**. |
| Vận hành | Hoa hồng và Quyền lợi & Payout chuyển vào Vận hành; không còn nằm trong Báo cáo. |
| Route | Thêm `/signup` dùng Google OAuth; route `/register` cũ vẫn giữ nguyên cho đơn đăng ký hợp tác có `deal` và không còn được dùng làm đăng ký tài khoản. |
| Phân quyền | Menu không cấp quyền. Đơn hàng và màn hình nghiệp vụ vẫn kiểm tra session/RBAC tại API. |
| Dữ liệu/Tích hợp | Không đổi schema, RLS, SePay, Meta, cron hoặc tên miền. |
| Responsive | Menu desktop/mobile dùng cùng `auth-nav.js`; nhóm Tài khoản là accordion trên mobile. |
