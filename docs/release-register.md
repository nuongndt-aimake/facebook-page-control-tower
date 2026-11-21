# Sổ phát hành đã xác minh

> **Trạng thái: Đang dùng.** Cập nhật lần cuối: 2026-11-21 (Asia/Ho_Chi_Minh).
>
> Mục đích: một nguồn đối chiếu cho SHA, deployment, phạm vi và bằng chứng dữ liệu. Không dùng Git log hoặc một snapshot tài liệu cũ để suy đoán hệ thống production đang chạy gì.

## Quy tắc ghi nhận

- Mỗi release thay đổi chức năng phải ghi SHA, deployment Vercel, phạm vi, migration/API/RBAC bị tác động và kết quả test.
- Release chỉ đổi tài liệu phải ghi rõ **không thay database/API/RBAC**.
- Không ghi migration là “đã chạy” nếu không có history hoặc semantic verification trên đúng Supabase production `tlcjcqqnfjrqsoiaalfk`.
- Bất kỳ migration drift nào phải liên kết tới control plan; không backfill history hay chạy lại migration mù quáng.

## Các release gần nhất đã kiểm chứng

| Ngày | SHA | Vercel production | Phạm vi | Database/RBAC | Kiểm thử/bằng chứng |
| --- | --- | --- | --- | --- | --- |
| 2026-11-21 | `f65a3ea` | `dpl_49rYNpJTEWUbLkEZhrfuga8DCL4U` — READY | Đồng bộ menu: `/access` đổi tên **Tài sản được giao**, thuộc nhóm Tài khoản; 34 điểm vào dùng `auth-nav.js?v=20261121-account-assets`; chuẩn hóa chỉ mục tài liệu/lịch sử. | Không đổi schema, RPC, RLS, capability hoặc scope dữ liệu. | `node --check auth-nav.js`, `node --test`: 51/51 pass; `git diff --check` pass. |
| 2026-11-21 | `be356f9` | `dpl_EjEhQQnAyZxYLRhTZ9ES3djJyQhE` — READY | Ghi nhận drift migration production vào control plan. | Chỉ tài liệu. Query production xác minh `profile_self_save(uuid,jsonb)` tồn tại nhưng một số version không nằm migration history. | Đối chiếu trực tiếp `supabase_migrations.schema_migrations` trên project đúng. |
| 2026-11-21 | `a9521c7` | `dpl_3o7Rrf8fzBPSPtu3CrxQ6gvAxF4j` — READY | Thiết lập control plan C-01…C-07. | Chỉ tài liệu. | Review impact note và kiểm tra Vercel READY. |
| 2026-11-21 | `43a700e` | `dpl_FzGtvEMCjBQG91XkML79DouDJZpS` — READY | Cho tài khoản tự cập nhật tên hiển thị trong hồ sơ, không đổi email. | Có RPC `public.profile_self_save(uuid,jsonb)` trên production; migration history của version liên quan có drift, xem control plan C-06. | Test profile/API có trong suite Node của release kế tiếp; cần giữ semantic verification thay vì tin history đơn lẻ. |

## Liên kết kiểm soát

- [Kế hoạch chấn chỉnh tính nhất quán](reconciliation-control-plan-20261121.md)
- [Snapshot kế hoạch/điểm tạm dừng 19-11](project-status-and-next-gate-20261119.md) — chỉ lịch sử, không phải nguồn trạng thái hiện hành.
- [Quy ước thay đổi](change-governance.md)
