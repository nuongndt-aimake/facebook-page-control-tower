import { db, readBody, requireAdmin, send } from "../_lib.mjs";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export default async function handler(request, response) {
  try {
    requireAdmin(request);
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const input = await readBody(request);
    if (!input.page_id || !DAY.test(input.date || "") || !(Number(input.amount) >= 0)) return send(response, 400, { error: "page_id, date và amount hợp lệ là bắt buộc" });
    const rows = await db("revenue_entries", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      page_id: String(input.page_id), period_start: input.date, period_end: input.date, gross_amount: Number(input.amount),
      currency: input.currency || "USD", source: input.source || "manual_business_suite", note: input.note || null
    }) });
    return send(response, 201, rows[0]);
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
