import { db, readBody, requireAdmin, send } from "../_lib.mjs";
const TRANSITIONS = {
  approve_request: { request: "approved", deal: "onboarding", page: "onboarding" },
  bm_invited: { request: "bm_invited" },
  accepted: { request: "accepted" },
  task_granted: { request: "task_granted", deal: "active" },
  ready_for_handover: { deal: "handover_ready", page: "handover_ready" },
  complete_outright_handover: { deal: "completed", page: "handed_over" },
  cancel: { deal: "cancelled" }
};
export default async function handler(request, response) {
  try {
    requireAdmin(request);
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const input = await readBody(request), change = TRANSITIONS[input.action];
    if (!change || !input.deal_id || !input.page_id) return send(response, 400, { error: "Action, deal_id và page_id không hợp lệ" });
    if (input.action === "complete_outright_handover" && input.confirmation !== "RELEASED_AND_REMOVED")
      return send(response, 400, { error: "Bàn giao bán đứt cần xác nhận RELEASED_AND_REMOVED" });
    if (change.request) {
      if (!input.request_id) return send(response, 400, { error: "request_id là bắt buộc" });
      await db(`access_requests?id=eq.${encodeURIComponent(input.request_id)}`, { method: "PATCH", body: JSON.stringify({ status: change.request, updated_at: new Date().toISOString() }) });
    }
    if (change.deal) await db(`deals?id=eq.${encodeURIComponent(input.deal_id)}`, { method: "PATCH", body: JSON.stringify({ status: change.deal, updated_at: new Date().toISOString() }) });
    if (change.page) await db(`pages?id=eq.${encodeURIComponent(input.page_id)}`, { method: "PATCH", body: JSON.stringify({ custody_status: change.page }) });
    await db("handover_audit", { method: "POST", body: JSON.stringify({ page_id: input.page_id, deal_id: input.deal_id,
      action: input.action, actor: "admin", detail: { request_id: input.request_id || null, note: input.note || null } }) });
    return send(response, 200, { ok: true });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
