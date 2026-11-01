import { db, readBody, send } from "../_lib.mjs";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const input = await readBody(request);
    if (!input.deal_id || !input.name || !EMAIL.test(input.email || "")) return send(response, 400, { error: "Thiếu deal_id, họ tên hoặc email hợp lệ" });
    const deal = await db(`deals?id=eq.${encodeURIComponent(input.deal_id)}&select=id,status,deal_type&page=1`);
    if (!deal[0] || !["listed", "reserved"].includes(deal[0].status)) return send(response, 409, { error: "Giao dịch hiện không nhận đăng ký" });
    const rows = await db("access_requests", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      deal_id: input.deal_id, applicant_name: String(input.name).slice(0, 150), applicant_email: String(input.email).toLowerCase(),
      requested_task: input.requested_task || "ANALYZE"
    }) });
    return send(response, 201, { id: rows[0].id, status: "submitted" });
  } catch (error) { return send(response, 500, { error: error.message }); }
}
