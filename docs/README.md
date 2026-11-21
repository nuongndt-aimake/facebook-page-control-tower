> **Nguồn trạng thái hiện hành:** [Kế hoạch chấn chỉnh tính nhất quán và kiểm soát](reconciliation-control-plan-20261121.md). Snapshot `8ba970c` trong [đối chiếu điểm tạm dừng](project-status-and-next-gate-20261119.md) là lịch sử, không phải baseline release hiện hành.
# Tài liệu dành cho lập trình viên mới

Bản phát hành mới nhất: [Kho transaction, checkout giữ hàng và bán ngoài/Inhouse — Gate 2.2](inventory-fulfillment-release-20261119.md), đã ở production. Bao gồm impact note, ma trận quyền, API, UI, kiểm thử và phụ thuộc chưa triển khai.

Đọc theo thứ tự:

1. `project-structure.md` — vị trí mã nguồn.
2. `architecture.md` — luồng dữ liệu và ranh giới hệ thống.
3. `database.md` — bảng, khóa, migration và snapshot.
4. `meta-sync.md` — connection, token, queue và lịch đồng bộ.
5. `security-permissions.md` — Auth, RBAC, RLS và admin preview.
6. `reporting.md` — Page, nội dung, doanh thu, payout.
7. `deployment.md` — biến môi trường, OAuth và phát hành.
8. `runbook.md` — vận hành, chẩn đoán và rollback.
9. `roadmap.md` — phần đã có, phần đang nâng cấp và tiêu chí nghiệm thu.
10. `api-reference.md` — endpoint, action, header và mã lỗi.
11. `configuration.md` — biến môi trường, OAuth allowlist và rủi ro secret.
12. `frontend.md` — route, navigator, responsive và quy ước UI.
13. `sales-platform-rearchitecture-plan.md` và `sales-platform-design.md` — quyết định, lộ trình, luồng nghiệp vụ và IA mục tiêu của Sales Platform.
13. `testing.md` — smoke test, ma trận quyền và responsive QA.
14. `release-checklist.md` — checklist merge, preview và production.
15. `installation.md` — cài đặt, cấu hình, DNS, domain và kết nối hệ thống.
16. `meta-bm-operations.md` — cấu hình Meta App, BM/Page discovery và vận hành đồng bộ.
17. `documentation-audit.md` — kết quả audit chéo tài liệu, code, database và tích hợp.
18. `change-governance.md` — quy ước bắt buộc cho mọi thay đổi sau này.
19. `implementation-plan.md` — kế hoạch hành động, dependency, song song/tuần tự và pilot.
20. `module-map.md` — bản đồ module nghiệp vụ, Function boundary và quy trình phát hành an toàn.
21. `authorization-model-and-c04-matrix-20261121.md` — mô hình quyền hai lớp, matrix C-04, các mâu thuẫn và gate triển khai RBAC.
22. `member-operating-roles-20261121.md` — catalog vai trò vận hành, pack capability, RACI và các quyết định phân quyền cần chốt.
23. `production-schema-fingerprint-20261121.md` — drift migration production, bằng chứng semantic và gate migration an toàn.

## Quy tắc quan trọng

- `pages.id` là Meta Page ID; `pages.registry_id` là định danh nội bộ bất biến.
- Không lưu Page Access Token trong Database.
- `sync_runs` chỉ là lịch sử phiên; dữ liệu báo cáo phải đọc từ snapshot/metric đã lưu.
- Quyền tài chính không đồng nghĩa với quyền quản trị Page.
- Admin preview chỉ đọc và phải được audit.
- Phân biệt rõ hiện trạng đã chạy với hạng mục roadmap; không dùng tài liệu mục tiêu để kết luận tính năng đã có.

