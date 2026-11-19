import crypto from "node:crypto";
import { assertMutableContext, db, readBody, requirePlatformAdmin, send } from "../_lib.mjs";

const states = new Set(["draft", "available", "reserved", "external_sold", "inhouse_transferred", "cancelled"]);
const text = (value, length = 500) => String(value || "").trim().slice(0, length);

async function audit(context, action, targetId, details = {}) {
  return db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    actor_user_id: context.user.id, action, target_type: "sales_inventory_item", target_id: targetId, details
  }) });
}

export default async function handler(request, response) {
  try {
    const context = await requirePlatformAdmin(request);
    if (request.method === "GET") {
      const [items, details, inhouse, products] = await Promise.all([
        db("sales_inventory_items?select=*&order=created_at.desc&limit=500"),
        db("fanpage_inventory_details?select=*&limit=500"),
        db("inhouse_page_inventory?select=*&limit=500"),
        db("sales_products?select=id,sku,name,status,product_group,sellable&order=name.asc&limit=100")
      ]);
      return send(response, 200, { items, details, inhouse, products });
    }
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    assertMutableContext(context);
    const body = await readBody(request);
    if (body.action === "intake") {
      const productId = text(body.product_id, 80), facebookPageId = text(body.facebook_page_id, 80), pageLink = text(body.page_link, 1000);
      if (!productId || !facebookPageId || !/^https?:\/\//i.test(pageLink)) return send(response, 400, { error: "product_id, facebook_page_id và page_link hợp lệ là bắt buộc" });
      const inventoryCode = `FPINV-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      const rows = await db("sales_inventory_items?select=*&limit=1", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        product_id: productId, inventory_code: inventoryCode, status: "draft", purchase_cost_vnd: body.purchase_cost_vnd == null ? null : Math.max(0, Number(body.purchase_cost_vnd)), created_by: context.user.id
      }) });
      const item = rows[0];
      await db("fanpage_inventory_details", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ inventory_item_id: item.id, facebook_page_id: facebookPageId, page_link: pageLink, current_admin_reference: text(body.current_admin_reference, 1000) || null, current_bm_reference: text(body.current_bm_reference, 1000) || null, intake_note: text(body.intake_note, 2000) || null }) });
      await db("sales_inventory_ledger", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ inventory_item_id: item.id, action: "received", to_status: "draft", actor_user_id: context.user.id, reason: "admin_intake" }) });
      await audit(context, "sales_inventory_intake", item.id, { inventory_code: inventoryCode, facebook_page_id: facebookPageId });
      return send(response, 201, { item, inventory_code: inventoryCode });
    }
    const itemId = text(body.inventory_item_id, 80);
    if (!itemId) return send(response, 400, { error: "inventory_item_id là bắt buộc" });
    if (body.action === "publish") {
      const rows = await db(`sales_inventory_items?id=eq.${encodeURIComponent(itemId)}&status=eq.draft&select=*`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "available", updated_at: new Date().toISOString() }) });
      if (!rows[0]) return send(response, 409, { error: "Chỉ mã kho ở trạng thái nháp mới có thể mở bán" });
      await db("sales_inventory_ledger", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ inventory_item_id: itemId, action: "published", from_status: "draft", to_status: "available", actor_user_id: context.user.id }) });
      await audit(context, "sales_inventory_published", itemId);
      return send(response, 200, { item: rows[0] });
    }
    if (!["reserve", "release", "finalize"].includes(body.action)) return send(response, 400, { error: "action không hợp lệ" });
    const orderRef = text(body.order_ref, 120);
    if (!orderRef) return send(response, 400, { error: "order_ref là bắt buộc" });
    const rpc = body.action === "reserve" ? "sales_reserve_inventory_item" : body.action === "release" ? "sales_release_inventory_reservation" : "sales_finalize_inventory_item";
    const args = body.action === "finalize" ? { p_inventory_item_id: itemId, p_order_ref: orderRef, p_destination: states.has(body.destination) ? body.destination : "", p_actor_user_id: context.user.id, p_page_id: text(body.page_id, 100), p_reason: text(body.reason, 1000) || null } : { p_inventory_item_id: itemId, p_order_ref: orderRef, p_actor_user_id: context.user.id, p_reason: text(body.reason, 1000) || null };
    const result = await db(`rpc/${rpc}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(args) });
    await audit(context, `sales_inventory_${body.action}`, itemId, { order_ref: orderRef, destination: args.p_destination || null });
    return send(response, 200, { item: result?.[0] || result });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 400, { error: error.message }); }
}
