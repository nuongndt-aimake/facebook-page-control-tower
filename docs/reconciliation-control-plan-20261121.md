# Kế hoạch chấn chỉnh tính nhất quán và kiểm soát triển khai

**Trạng thái:** `Đang dùng` từ 2026-11-21. Đây là chỉ mục điều hành cho giai đoạn chấn chỉnh; không thay thế lịch sử trong các tài liệu cũ.

## Mục tiêu

Khóa một nguồn sự thật trước khi mở rộng nghiệp vụ: mọi tuyên bố về chức năng phải có bằng chứng code, migration, kiểm thử và deployment; mọi phần thiếu phải có owner, điều kiện nghiệm thu và trạng thái rõ ràng.

## Impact note

| Vùng | Tác động trong đợt này |
| --- | --- |
| UI/navigator | Chưa phát hành thay đổi menu nào trong tài liệu này. `/access` chỉ được coi là đã chuyển vào nhóm Tài khoản sau khi code và tài liệu cùng được commit/deploy. |
| API/database | Không tạo migration, không đổi dữ liệu nghiệp vụ, không đổi RLS/RBAC trong bước chuẩn hóa tài liệu. |
| Deployment | Baseline code production hiện hành: Git `43a700e`, Vercel `dpl_FzGtvEMCjBQG91XkML79DouDJZpS`, trạng thái READY. |
| Supabase | RPC `public.profile_self_save(uuid,jsonb)` đã được kiểm tra trực tiếp trên project production `tlcjcqqnfjrqsoiaalfk`. Các migration khác không được mặc định là đã apply chỉ từ việc có file trong repository. |
| Tài liệu | Các tài liệu tham chiếu `8ba970c` được giữ làm lịch sử, nhưng không được dùng làm baseline release sau 2026-11-21. |

## Quy tắc nguồn sự thật

1. **Release register** là nguồn duy nhất để trả lời: production đang chạy commit nào, deployment nào, migration nào đã xác minh.
2. **Capability register** là nguồn duy nhất để trả lời: chức năng ở `Đang dùng`, `Thử nghiệm`, `Roadmap`, `Blocked` hoặc `Hết hiệu lực`.
3. Kế hoạch cũ không bị xóa. Mỗi phần bị thay thế phải ghi ngày, lý do, tài liệu thay thế và commit/migration liên quan.
4. Không ghi “đã production” nếu mới có code/test local. Không ghi “đã apply database” nếu chưa có xác minh trực tiếp trên đúng project production.
5. Không phát hành code, menu hoặc tài liệu đang dirty cùng với một thay đổi không liên quan.

## Các lệch cần xử lý theo thứ tự

| ID | Lệch/thiếu chặt chẽ | Trạng thái | Cách khắc phục | Điều kiện đóng |
| --- | --- | --- | --- | --- |
| C-01 | Baseline tài liệu còn `8ba970c`, trong khi production hiện là `43a700e` | Mở | Lập release register, backfill ba release gần nhất và migration verified | Một tài liệu ghi rõ SHA, deployment, DB verification, ngày và phạm vi |
| C-02 | `/access` và `auth-nav.js` đã sửa local nhưng chưa ở Git/Vercel, còn tài liệu mô tả như đã dùng | Mở | Tách thành release riêng; rà responsive/RBAC menu; commit/deploy hoặc hoàn nguyên có chủ đích | Code, docs, production cùng một trạng thái |
| C-03 | Nhiều tài liệu modified/untracked đang được dùng như chỉ mục nhưng chưa commit | Mở | Chia thành: tài liệu hiện hành, lịch sử, bản nháp; review rồi commit theo nhóm | Không còn trạng thái “đang dùng” chỉ tồn tại local |
| C-04 | Định nghĩa capability chưa nối đủ tới API, RPC, permission và test âm quyền | Mở | Tạo ma trận module × route × action × API/RPC × scope × role/capability | Mỗi thao tác quản trị/kho/tài chính có server-side check và test denied |
| C-05 | Luồng đơn → bàn giao khách chưa dùng đúng snapshot người nhận từ đơn | Mở | Tái dùng UI giao Page nhưng khóa nguồn người nhận là order snapshot | Test buyer/guest/assignee/admin, hàng đủ/thiếu/lỗi/đổi Page |
| C-06 | Nhiều claim về migration production chưa có sổ xác minh tập trung | Mở | Đối chiếu migration history đúng project và tạo migration verification register | Có timestamp/ID xác minh, không công khai secret |
| C-07 | Tình trạng “đã test responsive” chủ yếu fixture, chưa có evidence live cho màn vừa đổi | Mở | Checklist 390/768/desktop cho từng release UI và ảnh/biên bản QA | Không overlap/menu chìm/bảng tràn toàn trang |

## Capability backlog sau khi khóa C-01 đến C-04

1. **Đơn hàng và bàn giao:** C-05; ưu tiên P0 vì tác động trực tiếp bán hàng.
2. **Reservation/đơn nợ:** chốt TTL, thứ tự ưu tiên, retry/audit trước khi bật worker/cron.
3. **Google Sheet thật:** cấu hình URL, quy trình yêu cầu/duyệt Google theo email; không tự đổi sharing.
4. **Hoa hồng CTV/affiliate/manager:** policy có hiệu lực theo thời gian, kỳ chốt, evidence, adjustment, approval và payout; không suy diễn từ mã giới thiệu.
5. **Hóa đơn điện tử:** chỉ tích hợp sau khi chốt nhà cung cấp và quy trình phát hành/gộp hợp pháp.
6. **Skill, khóa học, thuê bao:** triển khai tuần tự sau lõi Fanpage, từng nhóm có entitlement/expiry/RBAC riêng.

## Cổng triển khai tiếp theo

Không bắt đầu hạng mục mới nếu một trong các điều kiện sau chưa đạt:

- C-01 đến C-03 chưa đóng;
- role/action/data scope của module chưa có ma trận;
- migration/API/UI/docs/test chưa xuất hiện trong cùng release;
- ca denied, retry/concurrency khi liên quan kho/thanh toán chưa có test;
- QA 390px, 768px và desktop chưa có bằng chứng.

## Quyết định không suy diễn

- Giá nhập, giá bán, mức hoa hồng, TTL reservation, lựa chọn nhà cung cấp hóa đơn và thông tin Google sharing đều phải do quản lý chốt/cấu hình; không dùng giá của một lô cũ để suy ra lô mới.
- “Đơn paid”, callback 200 hoặc test webhook không mặc định đồng nghĩa giao dịch tiền thật đã được đối soát hoàn tất.
- Thấy menu không tạo quyền; thấy một route trống không đồng nghĩa bị từ chối quyền.
