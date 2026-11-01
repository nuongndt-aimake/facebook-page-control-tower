import { accessContext, createAdminPreviewToken, db, readBody, send } from "../_lib.mjs";

// Starts or stops a short-lived, read-only view of another user's access scope.
// The actor's own Supabase session remains required on every subsequent request.
export default async function handler(request, response) {
  try {
    const actor = await accessContext(request);
    if (!["platform_admin", "super_admin"].includes(actor.profile.role) || actor.preview) throw new Error("Forbidden");
    if (request.method === "DELETE") return send(response, 200, { ok: true, cleared: true });
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const body = await readBody(request);
    const targetId = String(body.user_id || "");
    const targetEmail = String(body.user_email || "").trim().toLowerCase();
    if ((!targetId && !targetEmail) || targetId === String(actor.user.id)) return send(response, 400, { error: "Chọn một tài khoản khác để xem trước" });
    const rows = await db(`profiles?select=id,email,display_name,role,status&${targetId ? `id=eq.${encodeURIComponent(targetId)}` : `email=ilike.${encodeURIComponent(targetEmail)}`}&limit=1`);
    const target = rows[0];
    if (!target) return send(response, 404, { error: "Không tìm thấy tài khoản" });
    if (["suspended", "deleted"].includes(target.status)) return send(response, 400, { error: "Không thể xem trước tài khoản đã đình chỉ hoặc xóa" });
    const token = createAdminPreviewToken(actor.user.id, target.id);
    await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: actor.user.id, action: "admin_preview_start", target_type: "profile", target_id: target.id, details: { read_only: true, target_role: target.role } }) });
    response.setHeader("Set-Cookie", `adminPreviewToken=${token}; Max-Age=900; Path=/; SameSite=Lax`);
    return send(response, 200, { ok: true, token, expires_in: 900, target: { id: target.id, email: target.email, display_name: target.display_name, role: target.role } });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message }); }
}
