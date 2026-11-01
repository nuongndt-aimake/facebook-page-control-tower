# Checklist phát hành

## Trước khi merge

- [ ] Branch có tên `codex/<mô-tả>`.
- [ ] Không có secret, token, file `.env`, CSV/ZIP dữ liệu hoặc output cá nhân trong diff.
- [ ] API/JS đã chạy `node --check`.
- [ ] Migration mới có timestamp, index, RLS và ghi chú rollback.
- [ ] Nếu bật dispatcher: chạy pilot `limit=1`, kiểm tra `sync_jobs`, `sync_attempts`, `sync_runs`; nếu lỗi đặt `ENABLE_SYNC_ORCHESTRATOR=false`.
- [ ] Action mới có kiểm tra quyền server-side.
- [ ] Tài liệu API, database và runbook đã cập nhật.

## Trước deploy Preview

- [ ] Kiểm tra biến môi trường Preview.
- [ ] Đăng nhập Google thành công.
- [ ] Meta OAuth callback đúng domain.
- [ ] Báo cáo hiển thị đúng kỳ và không gọi Meta trực tiếp.
- [ ] Sync một Page thành công; lỗi một Page không làm hỏng toàn run.
- [ ] Mobile menu hoạt động ở 390px.

## Trước deploy Production

- [ ] Backup/đối chiếu database.
- [ ] Migration đã chạy đúng thứ tự.
- [ ] Kiểm tra cron hiện tại và slot active.
- [ ] Kiểm tra domain, SSL, redirect và privacy/terms.
- [ ] Ghi deployment URL, commit SHA và thời điểm phát hành.
- [ ] Có người chịu trách nhiệm rollback.
- [ ] Với mọi route/tính năng mới: ghi rõ điểm neo (mục navigator hoặc nút hành động) và kiểm tra điểm neo xuất hiện trên desktop/mobile.

## Sau deploy

- [ ] Mở `/api/auth/profile`, `/analytics`, `/groups`, `/payout`.
- [ ] Kiểm tra `sync_runs` gần nhất.
- [ ] Kiểm tra token health và cảnh báo quyền.
- [ ] Theo dõi lỗi Vercel Function trong 15 phút đầu.
- [ ] Xác minh alias production đang trỏ vào deployment READY chứa đúng commit SHA; deployment ERROR không được coi là đã phát hành.
