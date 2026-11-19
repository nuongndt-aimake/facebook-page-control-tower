# Nhật ký triển khai nền tảng bán hàng

## Gate 1 — nền dữ liệu, kiểm soát kho và báo cáo

- Trạng thái: `Thử nghiệm`
- Bắt đầu: 2026-11-19
- Migration: `supabase/migrations/20261119193000_sales_inventory_and_reporting_foundation.sql`
- Commit triển khai: `21dac0e` — `feat: add sales inventory foundation`
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
