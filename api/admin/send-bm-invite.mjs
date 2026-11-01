import { connections, db, graphPost, readBody, redactSecrets, requireAdmin, send } from "../_lib.mjs";

// An explicit, admin-authenticated action only. Never call this from the public
// registration endpoint: an email form alone must not grant business access.
export default async function handler(request, response) {
  try {
    requireAdmin(request);
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    if (process.env.ENABLE_META_BM_INVITES !== "true") return send(response, 403, { error: "BM invite automation is disabled" });
    const input = await readBody(request);
    if (!input.request_id) return send(response, 400, { error: "request_id là bắt buộc" });
    const requests = await db(`access_requests?id=eq.${encodeURIComponent(input.request_id)}&select=*`);
    const access = requests[0];
    if (!access) return send(response, 404, { error: "Không tìm thấy hồ sơ" });
    if (access.status !== "approved") return send(response, 409, { error: "Chỉ hồ sơ đã duyệt mới được mời vào BM" });
    const deals = await db(`deals?id=eq.${encodeURIComponent(access.deal_id)}&select=id,page_id`);
    const deal = deals[0];
    const pages = await db(`pages?id=eq.${encodeURIComponent(deal.page_id)}&select=id,meta_connection,custodian_business_id`);
    const page = pages[0];
    const connection = (await connections()).find(item => item.label === page.meta_connection);
    if (!connection) return send(response, 409, { error: "Không tìm thấy Meta connection quản lý Page" });
    const businessId = page.custodian_business_id || connection.business_ids?.[0];
    if (!businessId) return send(response, 409, { error: "Page chưa có custodian_business_id hoặc connection chưa khai business_ids" });
    const meta = await graphPost(`${businessId}/business_users`, connection.user_access_token, {
      email: access.applicant_email, role: "EMPLOYEE"
    });
    await db(`access_requests?id=eq.${encodeURIComponent(access.id)}`, { method: "PATCH", body: JSON.stringify({ status: "bm_invited", updated_at: new Date().toISOString() }) });
    await db("handover_audit", { method: "POST", body: JSON.stringify({ page_id: page.id, deal_id: deal.id,
      action: "bm_invite_sent", actor: "admin", detail: { request_id: access.id, email: access.applicant_email, business_id: businessId, meta: redactSecrets(meta) } }) });
    return send(response, 200, { ok: true, status: "bm_invited" });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
