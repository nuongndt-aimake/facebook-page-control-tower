# Governance thay đổi dự án

Đây là quy ước mặc định cho mọi yêu cầu phát triển sau này.

## Trạng thái tài liệu

Mỗi chức năng/cấu hình quan trọng phải có trạng thái:

- `Đang dùng`: đã có trong code và được kiểm thử.
- `Thử nghiệm`: có code nhưng chưa sẵn sàng production.
- `Roadmap`: đã thống nhất nhưng chưa triển khai.
- `Hết hiệu lực`: không còn được dùng; giữ lại lịch sử và ghi thay thế.
- `Blocked`: chưa thể triển khai vì phụ thuộc quyền, nền tảng hoặc quyết định chưa chốt.

Không xóa mục `Hết hiệu lực`. Mỗi mục hết hiệu lực phải ghi `effective_until`, lý do, replacement và commit/migration.

## Impact note bắt buộc

Trước khi merge/deploy, người thực hiện phải trả lời:

| Vùng | Câu hỏi |
| --- | --- |
| Chức năng | Luồng nào thay đổi? Có tương thích ngược không? |
| API | Endpoint/action, request/response, lỗi và auth thay đổi thế nào? |
| Database | Bảng, khóa, index, RLS, migration, dữ liệu cũ ảnh hưởng ra sao? |
| Phân quyền | Role nào được thêm/bớt? User cũ thấy gì sau thay đổi? |
| UI | Route, navigator, bộ lọc, trạng thái, empty/error state thay đổi ở đâu? |
| Responsive | 390px/768px/desktop đã kiểm tra chưa? |
| Tích hợp | Meta, BM, Supabase, Vercel, DNS hoặc cron có bị ảnh hưởng không? |
| Dữ liệu | Có cần backfill, cache invalidation hoặc re-sync không? |
| Tài liệu | README/API/database/runbook/roadmap nào cần cập nhật? |

## Checklist chức năng hoặc màn hình mới

- [ ] Có route và navigator thống nhất.
- [ ] Mọi route/tính năng mới phải có điểm neo rõ ràng trong navigator chung hoặc nút chức năng của màn hình liên quan; không để route chỉ có thể truy cập bằng cách tự nhớ URL.
- [ ] Có access context/RBAC server-side.
- [ ] Có RLS hoặc endpoint trung gian phù hợp.
- [ ] Có trạng thái loading, empty, error và permission denied.
- [ ] Có audit nếu là thao tác quản trị/tài chính.
- [ ] Có bộ lọc/phân trang nếu dữ liệu lớn.
- [ ] Có card/accordion phù hợp mobile.
- [ ] Có cập nhật API reference, frontend docs và runbook.

## Checklist role/quyền mới

- [ ] Cập nhật constraint/enum và migration.
- [ ] Cập nhật access context.
- [ ] Cập nhật ma trận quyền.
- [ ] Cập nhật mọi API có liên quan.
- [ ] Cập nhật navigator và action visibility.
- [ ] Kiểm thử role mới, role cũ và user bị từ chối.
- [ ] Kiểm tra tuyến trên/tuyến dưới, Page access và payout access.

## Checklist UI desktop/mobile

- [ ] 390px: menu mở/đóng được và nổi trên nội dung.
- [ ] 390px: không overlap label, input, button, chart.
- [ ] 768px: bố cục chuyển tiếp hợp lý.
- [ ] Desktop: không co giãn bất thường, không lệch hàng.
- [ ] Bảng lớn chuyển card/list hoặc accordion trên mobile.
- [ ] Không dùng chú thích kỹ thuật trực tiếp trong UI nghiệp vụ.

## Quy trình merge/deploy

1. Tạo branch `codex/<mô-tả>`.
2. Viết impact note trong PR hoặc commit body.
3. Sửa code, migration và tài liệu cùng một thay đổi.
4. Chạy syntax check, link check, smoke test và responsive QA.
5. Deploy Preview, kiểm tra integration.
6. Deploy Production, ghi commit SHA và trạng thái tài liệu.
7. Nếu rollback, không xóa lịch sử; đánh dấu phiên bản hết hiệu lực.
