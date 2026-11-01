import { db, readBody, requireAdmin, send } from "../_lib.mjs";

const TYPES = new Set(["revenue_share", "outright_sale"]);
export default async function handler(request, response) {
  try {
    requireAdmin(request);
    if (request.method === "GET") {
      const [deals, requests] = await Promise.all([
        db("deals?select=*,page:pages(id,name,custody_status)&order=created_at.desc"),
        db("access_requests?select=*,deal:deals(id,title,deal_type,page_id)&order=submitted_at.desc&limit=200")
      ]);
      return send(response, 200, { deals, requests });
    }
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const input = await readBody(request);
    if (!input.page_id || !input.title || !TYPES.has(input.deal_type)) return send(response, 400, { error: "page_id, title và deal_type hợp lệ là bắt buộc" });
    if (input.deal_type === "revenue_share" && !(Number(input.revenue_share_percent) > 0 && Number(input.revenue_share_percent) <= 100))
      return send(response, 400, { error: "Revenue share phải từ 0 đến 100" });
    const records = await db("deals", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      page_id: String(input.page_id), deal_type: input.deal_type, title: String(input.title).slice(0, 200),
      asking_price: input.asking_price || null, currency: input.currency || "VND", revenue_share_percent: input.deal_type === "revenue_share" ? Number(input.revenue_share_percent) : null,
      terms_note: input.terms_note || null, status: "listed"
    }) });
    await db("handover_audit", { method: "POST", body: JSON.stringify({ page_id: String(input.page_id), deal_id: records[0].id,
      action: "deal_listed", actor: "admin", detail: { deal_type: input.deal_type } }) });
    return send(response, 201, records[0]);
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
