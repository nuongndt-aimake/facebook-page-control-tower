# Vận hành Inhouse, Page hỏng và báo cáo cộng tác viên

Trạng thái: **Đang triển khai**. Tiếp nối Gate 2.2, yêu cầu bổ sung ngày 2026-11-19.

## Phạm vi bổ sung được chốt trong cùng đợt

- Giá mặc định chồng lên giá admin đã được sửa riêng tại commit `f44810e`: 3.000.000 đ/Page, không thay snapshot đơn cũ. [Biên bản giá](price-baseline-overlap-20261119.md).
- Tách mã ưu đãi và mã giới thiệu trên form/API/snapshot đơn. Mã ưu đãi giảm sau chiết khấu; mã giới thiệu chỉ gắn quà, không giảm thêm tiền. Gift URL chỉ trả sau paid/zero verified. INHOUSE mặc định 100% nội bộ, yêu cầu staff + finalize; không QR cho đơn 0đ.
- Admin: giá và lịch chiết khấu cùng khu vực, có effective_from/effective_until; không dùng mô tả mức cố định. Giữ phiên bản, đọc cùng dữ liệu ở public/quote. Thêm cấu hình mã ưu đãi, mã giới thiệu/quà, hỗ trợ điện thoại/Zalo/OA. Khi chưa nhập contact/OA, không tự bịa thông tin liên hệ hoặc mở widget chưa cấu hình.
- Menu mobile dùng vị trí viewport, chiều cao theo màn hình và cuộn riêng, tránh bị ancestor cắt; active/group/tap/đăng xuất giữ logic chung.
- Đơn hàng thay bảng hệ thống bằng 7 cột nghiệp vụ, Xem đơn/Chi tiết HĐ gọi khi cần. Bộ lọc người mua, xuất riêng/gộp, mới/nợ Page/đang cấp/thành công/lỗi-bảo hành/chờ thanh toán/tất cả. Mặc định đơn mới.
- **Thay đổi yêu cầu Gate 2.2:** thiếu kho vẫn nhận đơn, giữ được bao nhiêu ghi nhận bấy nhiêu và cảnh báo nhập kho. Đơn paid khi nhân viên chọn Xử lý tự đề xuất phần còn thiếu theo FIFO/lock. Đủ mã → allocated, bắt đầu cấp → granting; chỉ xác nhận access_granted sau cấp quyền ngoài hệ thống mới completed. API/RPC vẫn kiểm tra scope và phạm vi đơn.
- Bảo hành dùng capability `sales_inventory.warranty`, không mở bằng ẩn/hiện nút. Đơn paid có Page lỗi: ghi lỗi + chi phí một lần, giữ link lịch sử thay thế, gắn Page khác hoặc ghi nợ khi chưa có kho. Không đổi doanh thu/số tiền đơn, không tạo lần thanh toán mới. Xác nhận bàn giao lại yêu cầu access_granted. Bảng warranties RLS, RPC chỉ service_role.
- Migration liên quan: `20261119223000_sales_referral_code_split.sql`, `20261119224000_order_allocation_debt_and_warranty.sql`. Không đổi DNS, webhook, tiền thật, credential hoặc quyền Facebook bên ngoài.

Quy tắc cũ từ chối checkout thiếu kho và bảng đầy đủ mọi cột **Hết hiệu lực** ngày 2026-11-19 trong phạm vi các yêu cầu mới này. Giữ mô tả cũ để tra cứu; không áp dụng lại RPC/luồng cũ làm mất thông tin nợ/bảo hành.

## Impact note trước triển khai

| Vùng | Thay đổi và nguyên tắc |
| --- | --- |
| Kho | Danh sách theo cột nghiệp vụ, thông tin hệ thống chuyển khỏi danh sách thông thường. Giữ ledger và API tương thích. Thêm trạng thái hỏng và ghi nhận tổn thất theo giá nhập một lần; không sinh doanh thu. Reserved phải trả mã trước; đã bán ngoài không được ghi hỏng như hàng còn sở hữu. |
| Tài sản | `/access` lấy Page từ kho Inhouse, bỏ BM/sync và thao tác refresh Meta. Không xóa dữ liệu cũ. Giữ gán nhân sự và thêm/đính kèm payout thủ công cho Page Inhouse. |
| Báo cáo | `/daily-reports` cho người được phân công nộp số bài, doanh thu ngày, luỹ kế và bằng chứng. Mỗi assignment/ngày duy nhất, sửa có revision, bản đã duyệt không sửa trực tiếp. Tổng quan và ba trang báo cáo hiển thị thống kê cùng nguồn theo phạm vi. |
| Database | Migration additive cho damaged/writeoff, report revisions, hàm transaction. Bảng mới RLS, client không được gọi trực tiếp; RPC SECURITY INVOKER service_role. Không xoá lịch sử Meta/đơn/kho. |
| Quyền | Thêm kho `writeoff`; `sales_operations` gồm `manage_payout`, `verify_reports`, `read_reports_all`. Người có active assignment nộp báo cáo của mình; manager kế thừa visibility theo tuyến hiện có, không kế thừa hoa hồng. Đồng bộ server, RPC, UI nhân sự và menu. |
| Tích hợp | Không đổi DNS/SePay/env/cron, không đồng bộ Facebook; không kết nối hoặc ghi ngược Google Sheet. |
| Tài liệu | API, database, frontend, RBAC, roadmap, runbook và thiết kế được cập nhật cùng code. |

## Luồng và ranh giới

1. Kho nháp/sẵn bán hoặc Inhouse → báo hỏng có lý do + giá nhập đã biết → transaction cập nhật trạng thái/ledger/tổn thất/audit. Inhouse hỏng tạm ngừng vận hành và ngừng nhận báo cáo mới, giữ phân công/lịch sử để tra cứu. Không hoàn kho hỏng qua nút Mở bán.
2. Tài sản chỉ liệt kê Page Inhouse; gán người vẫn dùng assignment hiện có. Payout nhập tay không đổi ngày đồng bộ và không cần BM.
3. CTV chọn phân công của chính mình, mặc định báo cáo ngày hôm trước theo giờ Việt Nam; nộp/sửa bản chưa duyệt. Người có quyền duyệt chỉ duyệt trong phạm vi được xem, không tự duyệt báo cáo mình.
4. Tổng số bài/doanh thu báo cáo tách submitted/verified; rejected không được cộng. Luỹ kế là giá trị mới nhất mỗi assignment, không cộng qua các ngày. Hai người chung Page giữ hai kết quả rồi tổng hợp theo Page. Không suy ra hoa hồng hay cộng quyền lợi quản lý.

## Ma trận quyền

| Chủ thể | Đọc | Ghi |
| --- | --- | --- |
| Khách/chưa đăng nhập | Không truy cập kho/tài sản/báo cáo | Không |
| Người được phân công | Tài sản được cấp, báo cáo của mình | Nộp/sửa báo cáo assignment active của chính mình |
| Quản lý theo tuyến | Báo cáo mình và tuyến dưới, nhãn trực tiếp/kế thừa | Không tự nhận quyền duyệt/payout/writeoff |
| Kho writeoff | Kho đã cấp read | Báo hỏng theo điều kiện trạng thái |
| assign_inhouse | Kho Inhouse theo quyền hiện có | Chỉ định nhân sự, không cấp Facebook quyền |
| manage_payout | Hồ sơ payout nghiệp vụ Inhouse | Tạo/đính kèm payout; không sửa hồ sơ nguồn Meta |
| verify_reports | Báo cáo trong phạm vi | Duyệt/từ chối báo cáo người khác |
| read_reports_all | Toàn bộ báo cáo vận hành | Không tự có quyền duyệt |
| platform/super admin | Toàn bộ | Đầy đủ, vẫn theo invariant |

## Kế hoạch nghiệm thu

Nghiệm thu bổ sung: 18 test ứng dụng đạt; 53 kiểm tra DB trong 3 suite rollback (21 kho, 17 vận hành/báo cáo, 15 nợ/bảo hành/lịch chiết khấu). API với Supabase thật qua server QA đạt 24 bước. Menu 390×450 có panel cuộn riêng và nút đăng xuất tới được; bảng đơn/bộ lọc, phân bổ, quà/chiết khấu/hỗ trợ đã kiểm tra layout. Chưa nhận được số điện thoại/Zalo/OA ID và link quà thật từ người dùng; các ô admin đã sẵn sàng để cấu hình, không tự đặt thông tin mẫu lên production.

Kết quả trước phát hành: migration đã apply; 17 kiểm tra database rollback đạt, gồm NULL assignment, âm quyền, sửa/duyệt/revision, hai người một Page, writeoff idempotent và audit rollback. 16 kiểm thử ứng dụng đạt. Luồng API mới chạy với đăng nhập Supabase và dữ liệu riêng đạt 24 bước; đã dọn tài khoản, tài sản, báo cáo, payout, chi phí và đơn QA. Responsive đã kiểm tra 390×844, 768×1024, 1440×960: form 42px, bảng/card và hộp thoại không tràn trang.

## API và dữ liệu tương thích

- `endpoint=inhouse_assets`: GET scope Page Inhouse của actor, hoặc toàn kho theo capability; không đọc BM/sync. POST assign dùng `assign_inhouse`; save_payout dùng `manage_payout`, không sửa hồ sơ đã có theo mã mà đính kèm qua ID. Payout tài khoản nhận chỉ trả cho người có capability quản lý hoặc payout access hiện hữu.
- `endpoint=content_reports`: GET có start/end/day, lọc reporter theo cây quản lý hoặc `read_reports_all`; POST submit/verify/reject. RPC kiểm tra lại quyền và quan hệ trên database. Người được gán không dùng assignment NULL hoặc assignment người khác. Bản verified khoá; submitted/rejected có thể sửa và lưu revision. Không cộng rejected; luỹ kế lấy bản mới nhất mỗi assignment trong kỳ.
- `endpoint=operations_permissions`: admin cấp scope chủ động; UI Nhân sự dùng cùng danh sách quyền. Không thêm role.
- Kho POST writeoff gọi RPC riêng transaction. Bảng writeoff unique theo inventory_item_id, cost snapshot = purchase cost, revenue bị constraint bằng 0. Bất kỳ lỗi ledger/audit rollback mọi bước. Kho hỏng không được chốt/giữ/mở bán mới; Inhouse chuyển suspended nhưng giữ assignment/report lịch sử.
- Migration `20261119220000_inhouse_operations_daily_reports.sql`; RLS và revoke client ở bảng mới, RPC chỉ service_role. Không cập nhật Page Meta cũ, đơn hoặc giá snapshot cũ.

## Thay thế và vận hành

Quy ước hiển thị tất cả cột kho trong Gate 2.2 **Hết hiệu lực** từ đợt này, thay bằng 6 cột nghiệp vụ và Chi tiết/Lịch sử; bảng đơn giữ nguyên. Màn hình Tài sản BM/Meta cũ **Hết hiệu lực riêng tại /access**; dữ liệu và module Meta vẫn giữ lịch sử, không xoá hay đồng bộ khi tải tài sản.

Nhân sự → Quyền: cấp Xem kho/Ghi nhận Page hỏng hoặc các quyền Payout/Duyệt báo cáo phù hợp. Báo cáo → Báo cáo cộng tác viên là điểm nộp; Tổng quan/Page/Nội dung/Doanh thu có khối số liệu vận hành chung. Đơn giá hoa hồng và Google Sheet chưa được bật trong đợt này. Page đang giữ phải trả mã/đối soát trước khi ghi hỏng. Nếu chưa có giá nhập, người được cấp writeoff phải nhập chi phí hợp lệ trước khi xác nhận.

Nếu rollback API, giữ schema additive và lịch sử. Không khôi phục hàng hỏng bằng cách sửa status tay hoặc xoá writeoff; cần nghiệp vụ đối soát/phục hồi riêng. Không tắt đồng loạt cron hoặc thay cấu hình Meta/DNS/SePay của hệ thống khác.

- Rollback writeoff khi ledger/audit lỗi, nhấn lặp không tính tổn thất hai lần, chặn hàng đang giữ/đã bán; không phát sinh doanh thu.
- Scope tài sản Inhouse, payout và phân công; âm quyền cả API lẫn RPC.
- CTV không sửa assignment/người khác, một ngày không trùng, revision đầy đủ, không sửa bản verified, không tự duyệt, manager thấy đúng tuyến.
- Hai CTV một Page: tổng theo Page bằng tổng cá nhân; không cộng dồn luỹ kế qua ngày, không cộng rejected/hoa hồng chưa chốt.
- Responsive 390px/768px/desktop; migration trước deploy; dữ liệu QA tách riêng và dọn sau test.
