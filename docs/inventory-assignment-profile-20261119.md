# Giao nhân sự, hồ sơ dùng chung và lọc Inhouse — 2026-11-19

Trạng thái: Đã có code và kiểm thử, đang phát hành đầy đủ cùng báo cáo USD/payout.

Kiểm thử: 40 test Node toàn dự án; SQL scope/contact/account 12 checks, kèm 32 hồi quy báo cáo/payout/vận hành. Tìm kiếm Inhouse không dấu cho kết quả đúng 1/4 trong fixture, đã quan sát mobile/desktop. Modal giao người/contacts/đổi tên được kiểm tra logic và SQL; lần kiểm tra CUA tiếp theo bị công cụ dừng do không xác định URL đủ chắc chắn, chưa coi là đã kiểm tra trực tiếp mọi tương tác UI. Không giữ dữ liệu fixture trên production.

Yêu cầu phát hành bổ sung: số Page/phân công/Payout trên Tài khoản chỉ lấy từ `operations_account_assets` (kho Inhouse hiện hành, loại retired, scope đúng vai trò), không đếm lại Page đồng bộ Meta hoặc grants cũ. Thay ô quyền đồng bộ bằng số Page trực tiếp; không xóa hồ sơ/grant lịch sử. Tất cả cập nhật hồ sơ, thống kê tài khoản và phạm vi Page được phát hành cùng đợt, không treo riêng.

## Phạm vi Page theo vai trò — bổ sung đã chốt

| Vai trò | Page hiển thị | Dòng báo cáo được nhập |
| --- | --- | --- |
| platform_admin / super_admin | Tất cả | Chỉ phân công trực tiếp của chính mình; duyệt người khác theo quyền |
| manager | Trực tiếp và nhân sự thuộc tuyến quản lý (kể cả gián tiếp) | Chỉ của chính mình; tuyến dưới xem/duyệt theo scope |
| operator / analyst / viewer và cộng tác viên | Trực tiếp của mình | Chỉ của chính mình |

Áp dụng trong SQL helper + API kho, Inhouse, Tài sản, báo cáo và payout Page; không chỉ lọc UI. Page mới chưa phân công do mình/tuyến mình chuyển kho được nhìn thấy để giao lần đầu. Scope chức năng vẫn phải có; read/assign_inhouse/manage_payout không tự mở phạm vi Page ngoài quy tắc này. Quy tắc `read_reports_all` mở vượt tuyến cho non-admin **Hết hiệu lực** theo yêu cầu mới, giữ dữ liệu grant cũ để đối chiếu, không dùng làm bypass. Không mở nhập thay nhân sự khác. Snapshot/history báo cáo và payout giữ nguyên.

## Impact note

- `/account`: thêm form sửa số điện thoại và Profile Facebook của chính tài khoản. API PATCH chỉ cho hai trường, lấy actor từ phiên đăng nhập; cấm sửa role/quyền/email/ID, cấm preview ghi. Phone đã có; thêm `profiles.facebook_profile_url` bằng migration. Không đồng bộ dữ liệu bí mật vào Google metadata.
- Modal giao nhân sự ở Inhouse/Tài sản: tìm theo tên/điện thoại, hiển thị Page tên/ID/link/tài khoản cầm và những người đã giao; có nút sao chép, hiện link Profile Facebook của nhân sự được chọn, sửa tên Page tại chỗ theo scope intake. Chỉ người có assign_inhouse nhận các thông tin liên hệ cần cho thao tác này.
- Kho tổng/Inhouse: sao chép nhanh ID, link, tên Page. Không che thông tin Page khi bật modal. Một Page nhiều người được giao, một nhân sự nhiều Page, không kết thúc phân công cũ khi thêm người.
- Kho Inhouse: tìm tên/ID/link/tài khoản cầm và người phụ trách, lọc trạng thái kho, người đang được giao hoặc chưa phân công; giữ bộ lọc khi tải lại, có thông báo không có kết quả.
- API inventory/operations trả phone/Profile Facebook cho capability assign_inhouse; người chỉ đọc kho vẫn chỉ nhận tên để tránh lộ thông tin liên hệ. Account self API và checkout lấy cùng profiles; không tin user_metadata để cấp quyền.
- RLS/role: không thêm role/capability. RLS bảo vệ hồ sơ và RPC; server PATCH không cho body chọn người khác. Kiểm tra không cấp quyền, nhập URL độc hại, cập nhật tài khoản khác và preview.
- UI 390/768/desktop, dialog nền tối/label/nút đồng bộ. Tài liệu API/database/frontend/security/runbook/testing cập nhật cùng commit. Không đổi SePay, domain, cron hoặc Meta sync.
