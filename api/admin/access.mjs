import { accessContext, authenticatedUser, createAdminPreviewToken, db, readBody, send } from "../_lib.mjs";
import { runSync, runOrchestratedSync, runPostSync } from "../cron/sync.mjs";
import crypto from "node:crypto";

// Manual sync must use the same business timezone as the report filters. Using
// UTC here makes a Vietnam morning sync fetch yesterday while the UI asks for
// "Hôm nay", leaving the current-period post list empty.
const todayUTC = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date()).replace(/\//g, "-");
function syncRange(period) {
  const today = todayUTC();
  const days = { "7d": 6, "28d": 27, "60d": 59, "90d": 89, "365d": 364 };
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousEnd = new Date(`${monthStart}T12:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousEndDate = previousEnd.toISOString().slice(0, 10);
  const previousStart = `${previousEndDate.slice(0, 7)}-01`;
  const since = period === "day" ? today
    : period === "this_month" ? monthStart
      : period === "last_month" ? previousStart
        : days[period] !== undefined ? new Date(Date.now() - days[period] * 86400000).toISOString().slice(0, 10)
          : new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
  return { since, until: period === "last_month" ? previousEndDate : today };
}

async function executeManualSync({ period = "all", pageId = null } = {}) {
  const effectivePeriod = period === "all" ? "365d" : period;
  const range = syncRange(effectivePeriod);
  if (String(process.env.ENABLE_SYNC_ORCHESTRATOR || "false").toLowerCase() === "true") {
    return runOrchestratedSync({ ...range, period: effectivePeriod, slotKey: "manual", pageId });
  }
  return runSync({ ...range, force: true, ...(pageId ? { pageIds: [pageId] } : {}) });
}

async function startPreview(request, response, actor) {
  if (!(actor.profile.role === "platform_admin" || actor.profile.role === "super_admin") || actor.preview) throw new Error("Forbidden");
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
}

const salesPaymentStates = new Set(["pending_payment", "paid", "reconciliation_required", "expired", "cancelled", "refunded"]);
const salesAdminRoles = new Set(["platform_admin", "super_admin"]);
const salesStaffRoles = new Set(["operator", "manager", "platform_admin", "super_admin"]);
const invoiceStatuses = new Set(["pending_payment", "ready_to_issue", "issued", "aggregate_pending", "aggregated", "cancelled"]);
function vietnamBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function syncInvoiceForPayment(orderId, paymentStatus) {
  const rows = await db(`sales_invoice_records?select=id,invoice_type,invoice_status&order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const invoice = rows[0];
  if (!invoice) return;
  const nextStatus = paymentStatus === "paid" ? (invoice.invoice_type === "individual" ? "ready_to_issue" : "aggregate_pending") : paymentStatus === "cancelled" ? "cancelled" : "pending_payment";
  if (invoice.invoice_status === "issued" || invoice.invoice_status === "aggregated" || invoice.invoice_status === nextStatus) return;
  await db(`sales_invoice_records?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ invoice_status: nextStatus, updated_at: new Date().toISOString() }) });
}
async function salesOrders(request, response, context) {
  if (!salesStaffRoles.has(context.profile.role) || context.preview) throw new Error("Forbidden");
  if (request.method === "GET") {
    const [products, orders, assignments, invoiceRecords, prices, promoCodes, settings] = await Promise.all([
      db("sales_products?select=*&order=created_at.desc"),
      db("sales_orders?select=*,product:sales_products(id,sku,name,product_type)&order=created_at.desc&limit=500"),
      db("sales_order_assignments?select=*"),
      db("sales_invoice_records?select=*&order=created_at.desc&limit=1000"),
      salesAdminRoles.has(context.profile.role) ? db("sales_product_prices?select=*&order=effective_from.desc") : Promise.resolve([]),
      salesAdminRoles.has(context.profile.role) ? db("sales_promo_codes?select=*&order=created_at.desc") : Promise.resolve([]),
      salesAdminRoles.has(context.profile.role) ? db("sales_settings?select=*") : Promise.resolve([])
    ]);
    const totalsByDay = new Map();
    for (const row of invoiceRecords.filter(row => row.invoice_type === "daily_aggregate")) {
      const key = `${row.aggregation_date}:${row.invoice_status}`;
      const item = totalsByDay.get(key) || { aggregation_date: row.aggregation_date, invoice_status: row.invoice_status, order_count: 0, expected_amount_vnd: 0 };
      const order = orders.find(order => String(order.id) === String(row.order_id));
      item.order_count += 1; item.expected_amount_vnd += Number(order?.expected_amount_vnd || 0); totalsByDay.set(key, item);
    }
    const staffOrderIds = new Set(assignments.filter(row => String(row.assignee_user_id) === String(context.user.id)).map(row => String(row.order_id)));
    return send(response, 200, { products, orders: salesAdminRoles.has(context.profile.role) ? orders : orders.filter(row => staffOrderIds.has(String(row.id))), assignments, invoice_records: invoiceRecords, prices, promo_codes: promoCodes, settings, invoice_aggregate_groups: [...totalsByDay.values()].sort((a, b) => String(b.aggregation_date).localeCompare(String(a.aggregation_date))) });
  }
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
  const input = await readBody(request);
  if (input.action === "verify_zero_value_order") {
    if (!input.order_id) return send(response, 400, { error: "Thiếu order_id" });
    const rows = await db(`sales_orders?select=id,expected_amount_vnd,zero_value_verification_status& id=eq.${encodeURIComponent(input.order_id)}&limit=1`.replace("& id", "&id"));
    const order = rows[0];
    if (!order || Number(order.expected_amount_vnd) !== 0 || order.zero_value_verification_status !== "pending_staff_verification") return send(response, 400, { error: "Đơn không ở trạng thái chờ xác minh miễn phí" });
    if (!salesAdminRoles.has(context.profile.role)) { const assignment = await db(`sales_order_assignments?select=order_id&order_id=eq.${encodeURIComponent(order.id)}&assignee_user_id=eq.${encodeURIComponent(context.user.id)}&limit=1`); if (!assignment[0]) throw new Error("Forbidden"); }
    await db(`sales_orders?id=eq.${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ payment_status: "paid", paid_at: new Date().toISOString(), zero_value_verification_status: "verified", zero_value_verified_by: context.user.id, zero_value_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    await syncInvoiceForPayment(order.id, "paid");
    await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "verify_zero_value_sales_order", target_type: "sales_order", target_id: order.id, details: {} }) });
    return send(response, 200, { ok: true });
  }
  if (!salesAdminRoles.has(context.profile.role)) throw new Error("Forbidden");
  if (input.action === "save_sales_setting") {
    const key = cleanText(input.setting_key, 80); if (key !== "profile_link_help_video") return send(response, 400, { error: "Cấu hình không hợp lệ" });
    const url = cleanText(input.url, 500); if (url && !/^https:\/\//i.test(url)) return send(response, 400, { error: "Video cần URL HTTPS" });
    await db("sales_settings?on_conflict=setting_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ setting_key: key, setting_value: { url }, updated_by: context.user.id, updated_at: new Date().toISOString() }) }); return send(response, 200, { ok: true });
  }
  if (input.action === "set_product_price") {
    const amount = Number(input.unit_price_vnd); if (!input.product_id || !Number.isSafeInteger(amount) || amount < 0) return send(response, 400, { error: "Giá sản phẩm không hợp lệ" });
    await db("sales_product_prices", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ product_id: input.product_id, unit_price_vnd: amount, effective_from: input.effective_from || new Date().toISOString(), created_by: context.user.id }) }); return send(response, 200, { ok: true });
  }
  if (input.action === "upsert_promo_code") {
    const code = cleanText(input.code, 64).toUpperCase(); const value = Number(input.discount_value);
    if (!/^[A-Z0-9_-]{3,64}$/.test(code) || !["fixed", "percent"].includes(input.discount_type) || !Number.isSafeInteger(value) || value < 0 || (input.discount_type === "percent" && value > 100)) return send(response, 400, { error: "Mã hoặc mức ưu đãi không hợp lệ" });
    const giftUrl = cleanText(input.gift_download_url, 500); if (giftUrl && !/^https:\/\//i.test(giftUrl)) return send(response, 400, { error: "Link quà tặng cần URL HTTPS" });
    await db("sales_promo_codes?on_conflict=code", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ code, code_type: input.code_type === "student_referral" ? "student_referral" : "promotion", discount_type: input.discount_type, discount_value: value, gift_name: cleanText(input.gift_name, 255) || null, gift_download_url: giftUrl || null, starts_at: input.starts_at || new Date().toISOString(), ends_at: input.ends_at || null, is_active: input.is_active !== false, created_by: context.user.id, updated_at: new Date().toISOString() }) });
    return send(response, 200, { ok: true });
  }
  if (input.action === "assign_order") {
    if (!input.order_id || !input.assignee_user_id) return send(response, 400, { error: "order_id và assignee_user_id là bắt buộc" });
    const assignees = await db(`profiles?select=id,status&id=eq.${encodeURIComponent(input.assignee_user_id)}&limit=1`);
    if (!assignees[0] || assignees[0].status !== "active") return send(response, 400, { error: "Người nhận đơn không hoạt động hoặc không tồn tại" });
    if (input.manager_user_id) { const managers = await db(`profiles?select=id,status&id=eq.${encodeURIComponent(input.manager_user_id)}&limit=1`); if (!managers[0] || managers[0].status !== "active") return send(response, 400, { error: "Quản lý nhận bàn giao không hoạt động hoặc không tồn tại" }); }
    const rows = await db("sales_order_assignments?on_conflict=order_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ order_id: input.order_id, assignee_user_id: input.assignee_user_id, manager_user_id: input.manager_user_id || null, assigned_by: context.user.id, handover_note: input.handover_note || null }) });
    await db(`sales_orders?id=eq.${encodeURIComponent(input.order_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ fulfillment_status: "assigned", updated_at: new Date().toISOString() }) });
    await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "assign_sales_order", target_type: "sales_order", target_id: input.order_id, details: { assignee_user_id: input.assignee_user_id, manager_user_id: input.manager_user_id || null, handover_note: input.handover_note || null } }) });
    return send(response, 200, rows[0]);
  }
  if (input.action === "set_payment_status") {
    if (!input.order_id || !salesPaymentStates.has(input.payment_status)) return send(response, 400, { error: "Trạng thái thanh toán không hợp lệ" });
    await db(`sales_orders?id=eq.${encodeURIComponent(input.order_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ payment_status: input.payment_status, updated_at: new Date().toISOString() }) });
    await syncInvoiceForPayment(input.order_id, input.payment_status);
    await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "set_sales_payment_status", target_type: "sales_order", target_id: input.order_id, details: { payment_status: input.payment_status, source: "manual_admin" } }) });
    return send(response, 200, { ok: true });
  }
  if (input.action === "mark_daily_invoice_issued") {
    const date = String(input.aggregation_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(response, 400, { error: "Ngày hóa đơn gộp không hợp lệ" });
    const rows = await db(`sales_invoice_records?select=id&invoice_type=eq.daily_aggregate&invoice_status=eq.aggregate_pending&aggregation_date=eq.${encodeURIComponent(date)}`);
    if (!rows.length) return send(response, 404, { error: "Không có đơn đã thanh toán chờ hóa đơn gộp trong ngày này" });
    const ids = rows.map(row => row.id).map(encodeURIComponent).join(",");
    await db(`sales_invoice_records?id=in.(${ids})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ invoice_status: "aggregated", issued_at: new Date().toISOString(), issued_by: context.user.id, issued_note: String(input.issued_note || "Xuất hóa đơn gộp cuối ngày").trim().slice(0, 500), updated_at: new Date().toISOString() }) });
    await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "mark_sales_daily_invoice_issued", target_type: "sales_invoice_aggregate", target_id: date, details: { aggregation_date: date, invoice_count: rows.length } }) });
    return send(response, 200, { ok: true, aggregation_date: date, invoice_count: rows.length });
  }
  return send(response, 400, { error: "Action không hỗ trợ" });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function sepayWebhook(request, response) {
  if (request.method !== "POST") return send(response, 405, { success: false, error: "Method not allowed" });
  const expected = process.env.SEPAY_WEBHOOK_API_KEY;
  const authorization = String(request.headers.authorization || "");
  const supplied = authorization.replace(/^Apikey\s+/i, "");
  if (!expected || !/^Apikey\s+/i.test(authorization) || !safeEqual(expected, supplied)) {
    console.warn("sepay_webhook_unauthorized", { configured: Boolean(expected), auth_scheme: authorization.split(/\s+/)[0] || "missing", supplied_length: supplied.length });
    return send(response, 401, { success: false, error: "Unauthorized" });
  }
  const payload = await readBody(request);
  const providerEventId = String(payload.id || payload.referenceCode || "");
  if (!providerEventId) return send(response, 400, { success: false, error: "Missing transaction id" });
  const existing = await db(`sales_payment_events?select=id&provider_event_id=eq.${encodeURIComponent(providerEventId)}&limit=1`);
  if (existing.length) return send(response, 200, { success: true, duplicate: true });
  const amount = Number(payload.transferAmount || 0);
  // SePay supplies `code` when a payment-code rule is configured. Test Mode
  // may only provide transfer content, so safely recognise our exact order
  // reference there as well. This does not match partial or arbitrary text.
  const contentReference = String(payload.content || "").match(/\bFS[A-Z0-9]{10}\b/i)?.[0] || "";
  const reference = String(payload.code || contentReference).trim().toUpperCase();
  const found = reference ? await db(`sales_orders?select=id,expected_amount_vnd,payment_status,payment_expires_at&payment_reference=eq.${encodeURIComponent(reference)}&limit=1`) : [];
  const order = found[0];
  const expired = order?.payment_expires_at && new Date(order.payment_expires_at).getTime() < Date.now();
  const processingStatus = payload.transferType !== "in" ? "rejected" : !order ? "unmatched" : expired ? "expired" : amount !== Number(order.expected_amount_vnd) ? "amount_mismatch" : "processed";
  await db("sales_payment_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider_event_id: providerEventId, order_id: order?.id || null, amount_vnd: Number.isFinite(amount) ? amount : null, processing_status: processingStatus, raw_payload: payload }) });
  if (order) {
    const update = processingStatus === "processed" ? { payment_status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { payment_status: "reconciliation_required", updated_at: new Date().toISOString() };
    await db(`sales_orders?id=eq.${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(update) });
    await syncInvoiceForPayment(order.id, update.payment_status);
  }
  return send(response, 200, { success: true, processing_status: processingStatus });
}
async function optionalAuthenticatedUser(request) { try { return await authenticatedUser(request); } catch { return null; } }
function cleanText(value, max = 255) { return String(value || "").trim().slice(0, max); }
function validInvoice(input) {
  if (!input.invoice_requested) return { requested: false };
  const customerName = cleanText(input.invoice_customer_name);
  const taxCode = cleanText(input.invoice_tax_code, 32).replace(/\s/g, "").toUpperCase();
  const billingAddress = cleanText(input.invoice_address, 500);
  const billingEmail = cleanText(input.invoice_email, 255).toLowerCase();
  if (customerName.length < 2 || !/^\d{10}(?:-?\d{3})?$/.test(taxCode) || billingAddress.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) throw new Error("Thông tin xuất hóa đơn chưa hợp lệ");
  return { requested: true, customer_name: customerName, tax_code: taxCode, billing_address: billingAddress, billing_email: billingEmail };
}
async function currentProductPrice(productId, fallback) {
  const now = encodeURIComponent(new Date().toISOString());
  const rows = await db(`sales_product_prices?select=unit_price_vnd&product_id=eq.${encodeURIComponent(productId)}&effective_from=lte.${now}&order=effective_from.desc&limit=1`);
  return Number(rows[0]?.unit_price_vnd ?? fallback);
}
async function publicSalesConfig(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
  const [products, settings] = await Promise.all([
    db("sales_products?select=id,sku,name,product_type,description,status,unit_price_vnd&status=eq.active&order=created_at.asc"),
    db("sales_settings?select=setting_key,setting_value&setting_key=eq.profile_link_help_video&limit=1")
  ]);
  const priced = await Promise.all(products.map(async product => ({ ...product, unit_price_vnd: await currentProductPrice(product.id, product.unit_price_vnd) })));
  return send(response, 200, { products: priced, profile_link_help_video_url: settings[0]?.setting_value?.url || "" });
}
async function publicCheckout(request, response) {
  if (String(process.env.SALES_PUBLIC_CHECKOUT_ENABLED).toLowerCase() !== "true") return send(response, 503, { error: "Checkout chưa mở" });
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
  const input = await readBody(request); const quantity = Math.max(1, Math.min(100, Number(input.quantity || 1)));
  const signedInUser = await optionalAuthenticatedUser(request);
  const profileRows = signedInUser ? await db(`profiles?select=id,email,display_name,phone&id=eq.${encodeURIComponent(signedInUser.id)}&limit=1`) : [];
  const account = profileRows[0] || {};
  const buyerName = cleanText(account.display_name || signedInUser?.user_metadata?.full_name || input.buyer_name);
  const buyerEmail = cleanText(signedInUser?.email || account.email || input.buyer_email).toLowerCase();
  const buyerPhone = cleanText(account.phone || signedInUser?.phone || signedInUser?.user_metadata?.phone || signedInUser?.user_metadata?.phone_number || input.buyer_phone, 40);
  const profileUrl = cleanText(input.fulfillment_profile_url, 500);
  if (!buyerName || !buyerPhone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || !/^https?:\/\//i.test(profileUrl)) return send(response, 400, { error: "Thiếu hoặc sai thông tin đơn hàng" });
  const invoice = validInvoice(input);
  const products = await db("sales_products?select=id,unit_price_vnd,status,product_type&sku=eq.FANPAGE&limit=1"); const product = products[0]; if (!product || product.status !== "active") return send(response, 503, { error: "Sản phẩm tạm ngưng" });
  const configuredUnitPrice = await currentProductPrice(product.id, product.unit_price_vnd);
  const now = new Date();
  const tiers = await db(`sales_discount_tiers?select=min_quantity,discount_percent&product_type=eq.${encodeURIComponent(product.product_type)}&is_active=eq.true&min_quantity=lte.${quantity}&effective_from=lte.${encodeURIComponent(now.toISOString())}&order=min_quantity.desc&limit=1`);
  const grossAmount = configuredUnitPrice * quantity;
  const discountPercent = Number(tiers[0]?.discount_percent || 0);
  const discountAmount = Math.round(grossAmount * discountPercent / 100);
  const afterBulkDiscount = grossAmount - discountAmount;
  const promoCodeValue = cleanText(input.promo_code, 64).toUpperCase();
  const promoRows = promoCodeValue ? await db(`sales_promo_codes?select=*&code=eq.${encodeURIComponent(promoCodeValue)}&is_active=eq.true&starts_at=lte.${encodeURIComponent(now.toISOString())}&order=created_at.desc&limit=1`) : [];
  const promo = promoRows[0];
  if (promoCodeValue && (!promo || (promo.ends_at && new Date(promo.ends_at) < now))) return send(response, 400, { error: "Mã ưu đãi không hợp lệ hoặc đã hết hạn" });
  const promoDiscount = promo ? Math.min(afterBulkDiscount, promo.discount_type === "percent" ? Math.round(afterBulkDiscount * Number(promo.discount_value) / 100) : Number(promo.discount_value)) : 0;
  const amount = afterBulkDiscount - promoDiscount;
  const orderCode = `FS${crypto.randomBytes(5).toString("hex").toUpperCase()}`; const reference = orderCode;
  const paymentExpiresAt = amount > 0 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  const rows = await db("sales_orders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ order_code: orderCode, product_id: product.id, buyer_user_id: signedInUser?.id || null, buyer_name: buyerName, buyer_phone: buyerPhone, buyer_email: buyerEmail, fulfillment_profile_url: profileUrl, quantity, unit_price_vnd: configuredUnitPrice, gross_amount_vnd: grossAmount, discount_percent: discountPercent, discount_amount_vnd: discountAmount, promo_code: promo?.code || null, promo_discount_vnd: promoDiscount, gift_name: promo?.gift_name || null, gift_download_url: promo?.gift_download_url || null, expected_amount_vnd: amount, payment_reference: reference, payment_expires_at: paymentExpiresAt, zero_value_verification_status: amount === 0 ? "pending_staff_verification" : null }) });
  if (signedInUser && !account.phone) await db(`profiles?id=eq.${encodeURIComponent(signedInUser.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ phone: buyerPhone, updated_at: new Date().toISOString() }) });
  const invoiceRecord = invoice.requested ? { customer_name: invoice.customer_name, tax_code: invoice.tax_code, billing_address: invoice.billing_address, billing_email: invoice.billing_email } : {};
  await db("sales_invoice_records", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ order_id: rows[0].id, invoice_type: invoice.requested ? "individual" : "daily_aggregate", invoice_status: "pending_payment", aggregation_date: vietnamBusinessDate(), ...invoiceRecord }) });
  const qr = amount > 0 ? `https://qr.sepay.vn/img?bank=MBBank&acc=VQRQANSMJ6468&amount=${amount}&des=${encodeURIComponent(reference)}` : null;
  return send(response, 201, { order: { id: rows[0].id, order_code: orderCode, amount_vnd: amount, gross_amount_vnd: grossAmount, discount_percent: discountPercent, discount_amount_vnd: discountAmount, promo_discount_vnd: promoDiscount, payment_reference: reference, payment_expires_at: paymentExpiresAt, zero_value_verification_status: rows[0].zero_value_verification_status, gift: promo?.gift_download_url ? { name: promo.gift_name || "Quà tặng", download_url: promo.gift_download_url } : null }, qr_url: qr, qr_download_url: qr ? `/api/checkout/qr?amount=${amount}&reference=${encodeURIComponent(reference)}` : null });
}
async function publicQrDownload(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
  const url = new URL(request.url, "http://localhost"); const amount = Number(url.searchParams.get("amount")); const reference = String(url.searchParams.get("reference") || "").toUpperCase();
  if (!Number.isSafeInteger(amount) || amount < 1000 || !/^FS[A-Z0-9]{10}$/.test(reference)) return send(response, 400, { error: "QR không hợp lệ" });
  const qrUrl = `https://qr.sepay.vn/img?bank=MBBank&acc=VQRQANSMJ6468&amount=${amount}&des=${encodeURIComponent(reference)}`;
  const qrResponse = await fetch(qrUrl); if (!qrResponse.ok) return send(response, 502, { error: "Không thể tạo QR để tải" });
  const image = Buffer.from(await qrResponse.arrayBuffer());
  response.statusCode = 200; response.setHeader("Content-Type", qrResponse.headers.get("content-type") || "image/png"); response.setHeader("Content-Disposition", `attachment; filename="QR-${reference}.png"`); response.setHeader("Cache-Control", "no-store"); return response.end(image);
}

export default async function handler(request, response) {
  try {
    const endpoint = new URL(request.url, "http://localhost").searchParams.get("endpoint");
    if (endpoint === "sepay-webhook") return await sepayWebhook(request, response);
    if (endpoint === "public-checkout") return await publicCheckout(request, response);
    if (endpoint === "public-sales-config") return await publicSalesConfig(request, response);
    if (endpoint === "public-qr-download") return await publicQrDownload(request, response);
    const context = await accessContext(request);
    if (endpoint === "preview") return await startPreview(request, response, context);
    if (endpoint === "sales-orders") return await salesOrders(request, response, context);
    const isAdmin = context.profile.role === "platform_admin" || context.profile.role === "super_admin";
    if (request.method === "GET") {
      if (endpoint === "payout") {
        const pageIds = isAdmin ? null : new Set((context.pageIds || []).map(String));
        const profileIds = isAdmin ? null : new Set((context.paymentProfileIds || []).map(String));
        const visibleUserIds = isAdmin ? null : new Set((context.visibleUserIds || []).map(String));
        const [pages, paymentProfiles, links, paymentAccess, commissions, users] = await Promise.all([
          db("pages?select=id,name,category,asset_scope,custodian_business_id,custodian_business_name&order=name.asc&limit=5000").catch(() => []),
          db("payment_profiles?select=*&order=updated_at.desc&limit=5000").catch(() => []),
          db("page_payment_profiles?select=page_id,payment_profile_id,relation_type,last_seen_at&limit=20000").catch(() => []),
          db("payment_profile_access?select=*&status=eq.active&limit=20000").catch(() => []),
          db("page_commissions?select=*&status=eq.active&limit=20000").catch(() => []),
          db("profiles?select=id,email,display_name,role,status&status=eq.active&order=email.asc&limit=5000").catch(() => [])
        ]);
        // A Payout grant is also an explicit visibility path for the Pages linked
        // to that payout profile. Do not require a second page_access row or the
        // manager would see the payout but not the asset it belongs to.
        const scopedLinks = links.filter(link => (!pageIds || pageIds.has(String(link.page_id))) && (!profileIds || profileIds.has(String(link.payment_profile_id))));
        const effectivePageIds = pageIds ? new Set([
          ...pageIds,
          ...scopedLinks.map(link => String(link.page_id))
        ]) : null;
        const scopedPages = effectivePageIds ? pages.filter(page => effectivePageIds.has(String(page.id))) : pages;
        const linkedProfileIds = new Set(scopedLinks.map(link => String(link.payment_profile_id)));
        const scopedProfiles = paymentProfiles.filter(profile => (!profileIds || profileIds.has(String(profile.id))) && (!profileIds && linkedProfileIds.size ? linkedProfileIds.has(String(profile.id)) : true));
        const scopedAccess = paymentAccess.filter(row => (!profileIds || profileIds.has(String(row.payment_profile_id))) && (!visibleUserIds || visibleUserIds.has(String(row.user_id))));
        const scopedCommissions = commissions.filter(row => !effectivePageIds || effectivePageIds.has(String(row.page_id)));
        const scopedUsers = users.filter(user => !visibleUserIds || visibleUserIds.has(String(user.id)));
        return send(response, 200, { pages: scopedPages, payment_profiles: scopedProfiles, profiles: scopedProfiles, links: scopedLinks, payment_access: scopedAccess, commissions: scopedCommissions, users: scopedUsers, access: { role: context.profile.role, page_ids: effectivePageIds ? [...effectivePageIds] : null, payment_profile_ids: profileIds ? [...profileIds] : null, inherited_page_ids: context.inheritedPageIds || [] } });
      }
      if (!isAdmin) throw new Error("Forbidden");
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      const [pages, businesses, users, access, assignments, histories, paymentProfiles, loadedGroups, loadedCategories, team, reportingLines, pageGroups, paymentAccess, commissions, pagePaymentProfiles, paymentProfileManagers, scheduleSlots, syncJobs, syncRuns, syncJobStatuses] = await Promise.all([
        db("pages?select=id,registry_id,name,category,meta_connection,managed_by_connection,asset_scope,custodian_business_id,custodian_business_name,current_status,group_name,topic,first_connected_at,last_seen_at,last_synced_at,updated_at&order=name.asc&limit=5000").catch(() => db("pages?select=id,name,category,meta_connection,custodian_business_id,updated_at&order=name.asc&limit=5000")),
        db("businesses?select=id,name,meta_connection,managed,last_synced_at&order=name.asc&limit=1000").catch(() => []),
        db("profiles?select=id,email,display_name,role,status,suspended_at,deleted_at,last_seen_at,admin_note&order=email.asc&limit=5000"),
        db("page_access?select=user_id,page_id,access_level&limit=10000"),
        db("page_assignments?select=*&status=neq.ended&order=assigned_at.desc&limit=20000").catch(() => []),
        db("page_connection_history?select=*&order=last_seen_at.desc&limit=20000").catch(() => []),
        db("payment_profiles?select=*&order=updated_at.desc&limit=5000").catch(() => []),
        db("content_groups?select=*&status=eq.active&order=name.asc&limit=5000").catch(() => []),
        db("content_categories?select=*&status=eq.active&order=name.asc&limit=2000").catch(() => []),
        db("team_memberships?select=*&status=eq.active&limit=10000").catch(() => []),
        db("user_reporting_lines?select=*&status=eq.active&limit=10000").catch(() => []),
        db("page_group_assignments?select=*&status=eq.active&limit=20000").catch(() => []),
        db("payment_profile_access?select=*&status=eq.active&limit=20000").catch(() => []),
        db("page_commissions?select=*&status=eq.active&limit=20000").catch(() => []),
        db("page_payment_profiles?select=page_id,payment_profile_id,relation_type,last_seen_at&limit=20000").catch(() => []),
        db("payment_profile_managers?select=*&status=eq.active&limit=20000").catch(() => []),
        db("sync_schedule_slots?select=slot_key,label,timezone,local_time,active,periods,max_concurrency,updated_at&order=local_time.asc&limit=20").catch(() => []),
        db("sync_jobs?select=id,page_id,slot_key,status,attempt_count,last_error,available_at,updated_at&order=updated_at.desc&limit=100").catch(() => []),
        db("sync_runs?select=id,ran_at,since_date,until_date,status,summary&order=ran_at.desc&limit=20").catch(() => []),
        db("sync_jobs?select=status&limit=10000").catch(() => [])
      ]);
      // Empty is a valid state. Do not silently create categories or groups while a
      // read request is running: creation belongs to the explicit Groups workflow.
      const syncJobCounts = syncJobStatuses.reduce((counts, row) => { const status = String(row.status || "unknown"); counts[status] = (counts[status] || 0) + 1; return counts; }, {});
      return send(response, 200, { pages, businesses, users, access, assignments, histories, payment_profiles: paymentProfiles, groups: loadedGroups, categories: loadedCategories, team, reporting_lines: reportingLines, page_groups: pageGroups, payment_access: paymentAccess, commissions, links: pagePaymentProfiles, payment_profile_managers: paymentProfileManagers, schedule_slots: scheduleSlots, sync_jobs: syncJobs, sync_runs: syncRuns, sync_job_counts: syncJobCounts });
    }
    if (request.method === "POST") {
      if (context.preview) throw new Error("Chế độ xem trước chỉ đọc; hãy thoát xem trước để thao tác");
      const body = await readBody(request);
      if (!isAdmin && body.action !== "sync_page") throw new Error("Forbidden");
      if (body.action === "update_sync_slot") {
        if (!isAdmin) throw new Error("Forbidden");
        const slotKey = String(body.slot_key || "");
        if (!slotKey) return send(response, 400, { error: "slot_key là bắt buộc" });
        const active = body.active === true;
        const periods = Array.isArray(body.periods) ? body.periods.filter(period => ["day", "7d", "28d", "60d", "90d", "365d", "this_month", "last_month"].includes(period)) : ["day"];
        const localTime = String(body.local_time || "");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) return send(response, 400, { error: "local_time phải có dạng HH:MM" });
        const maxConcurrency = Math.min(100, Math.max(1, Number(body.max_concurrency || 1)));
        const rows = await db(`sync_schedule_slots?slot_key=eq.${encodeURIComponent(slotKey)}&limit=1`);
        if (!rows[0]) return send(response, 404, { error: "Không tìm thấy slot đồng bộ" });
        const updatedAt = new Date().toISOString();
        await db(`sync_schedule_slots?slot_key=eq.${encodeURIComponent(slotKey)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ active, local_time: localTime, periods, max_concurrency: maxConcurrency, updated_at: updatedAt }) });
        await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "update_sync_slot", target_type: "sync_schedule_slot", target_id: slotKey, details: { active, local_time: localTime, periods, max_concurrency: maxConcurrency } }) });
        return send(response, 200, { ok: true, slot_key: slotKey, active, local_time: localTime, periods, max_concurrency: maxConcurrency });
      }
      if (body.action === "sync") {
        const period = body.period || "all";
        const sync = await executeManualSync({ period });
        return send(response, 200, { ok: true, selected_period: period, ...sync });
      }
      if (body.action === "sync_page") {
        const pageId = String(body.page_id || "");
        if (!pageId) return send(response, 400, { error: "page_id là bắt buộc" });
        if (!isAdmin && (context.profile.role !== "manager" || !context.pageIds.includes(pageId))) throw new Error("Forbidden");
        const sync = await executeManualSync({ period: body.period || "day", pageId });
        return send(response, 200, { ok: true, selected_period: body.period || "day", page_id: pageId, ...sync });
      }
      if (body.action === "post_sync") {
        if (!isAdmin) throw new Error("Forbidden");
        const limit = Math.min(100, Math.max(1, Number(body.limit || process.env.POST_SYNC_BATCH || 20)));
        const sync = await runPostSync({ limit });
        return send(response, 200, { ok: true, ...sync });
      }
      if (body.action === "refresh_assets") {
        const today = new Date().toISOString().slice(0, 10);
        const sync = await runSync({ force: true, since: today, until: today });
        return send(response, 200, { ok: true, ...sync, refresh_type: "asset_registry_and_daily_snapshot" });
      }
      if (body.action === "assign_page") {
        const pageId = String(body.page_id || "");
        if (!pageId) return send(response, 400, { error: "page_id là bắt buộc" });
        await db("page_assignments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ page_id: pageId, user_id: body.user_id || null, group_name: body.group_name || null, topic: body.topic || null, assignment_role: body.assignment_role || "operator", status: body.status || "active", note: body.note || null }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "upsert_profile") {
        const externalId = String(body.external_id || "").trim();
        if (!externalId) return send(response, 400, { error: "external_id là bắt buộc" });
        const now = new Date().toISOString();
        await db("payment_profiles?on_conflict=external_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ external_id: externalId, profile_name: body.profile_name || null, business_id: body.business_id || null, recipient_type: body.recipient_type || "person", recipient_name: body.recipient_name || null, recipient_account: body.recipient_account || null, receiving_account_name: body.receiving_account_name || null, receiving_account_id: body.receiving_account_id || null, managed_by_facebook_user_id: body.managed_by_facebook_user_id || null, status: body.status || "active", currency: body.currency || "USD", payout_status: body.payout_status || null, note: body.note || null, raw_json: body.raw_json || {}, updated_at: now, last_synced_at: now }) });
        const rows = await db(`payment_profiles?external_id=eq.${encodeURIComponent(externalId)}&select=*&limit=1`);
        return send(response, 200, { ok: true, profile: rows[0] || null });
      }
      if (body.action === "link_page") {
        if (!body.page_id || !body.payment_profile_id) return send(response, 400, { error: "page_id và payment_profile_id là bắt buộc" });
        await db("page_payment_profiles?on_conflict=page_id,payment_profile_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ page_id: String(body.page_id), payment_profile_id: body.payment_profile_id, relation_type: body.relation_type || "associated", last_seen_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "unlink_page") {
        await db(`page_payment_profiles?page_id=eq.${encodeURIComponent(String(body.page_id || ""))}&payment_profile_id=eq.${encodeURIComponent(String(body.payment_profile_id || ""))}`, { method: "DELETE" });
        return send(response, 200, { ok: true });
      }
      if (body.action === "set_manager") {
        if (!body.payment_profile_id) return send(response, 400, { error: "payment_profile_id là bắt buộc" });
        await db("payment_profile_managers?on_conflict=payment_profile_id,facebook_user_id,connection_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ payment_profile_id: body.payment_profile_id, facebook_user_id: body.facebook_user_id || null, connection_id: body.connection_id || null, manager_name: body.manager_name || null, role: body.role || "operator", status: body.status || "active", last_seen_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "create_group") {
        const name = String(body.name || "").trim();
        if (!name) return send(response, 400, { error: "Tên nhóm là bắt buộc" });
        await db("content_groups?on_conflict=name", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ name, description: body.description || null, category_id: body.category_id || null, parent_group_id: body.parent_group_id || null, status: body.status || "active", updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "create_category") {
        const name = String(body.name || "").trim();
        if (!name) return send(response, 400, { error: "Tên danh mục là bắt buộc" });
        await db("content_categories?on_conflict=name", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ name, description: body.description || null, status: body.status || "active", updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "update_category" || body.action === "update_group") {
        const table = body.action === "update_category" ? "content_categories" : "content_groups";
        const id = String(body.id || "");
        if (!id) return send(response, 400, { error: "Thiếu mã bản ghi" });
        const payload = { name: String(body.name || "").trim(), description: body.description || null, updated_at: new Date().toISOString() };
        if (body.action === "update_group") { payload.category_id = body.category_id || null; payload.parent_group_id = body.parent_group_id || null; }
        if (!payload.name) return send(response, 400, { error: "Tên không được để trống" });
        await db(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "delete_category" || body.action === "delete_group") {
        const table = body.action === "delete_category" ? "content_categories" : "content_groups";
        const id = String(body.id || "");
        if (!id) return send(response, 400, { error: "Thiếu mã bản ghi" });
        await db(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "archived", updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "assign_group") {
        if (!body.page_id || !body.group_id) return send(response, 400, { error: "page_id và group_id là bắt buộc" });
        await db("page_group_assignments?on_conflict=page_id,group_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ page_id: String(body.page_id), group_id: body.group_id, assigned_by: body.assigned_by || null, status: body.status || "active", note: body.note || null }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "unassign_group") {
        if (!body.page_id || !body.group_id) return send(response, 400, { error: "page_id và group_id là bắt buộc" });
        await db(`page_group_assignments?page_id=eq.${encodeURIComponent(String(body.page_id))}&group_id=eq.${encodeURIComponent(String(body.group_id))}`, { method: "DELETE" });
        return send(response, 200, { ok: true });
      }
      if (body.action === "set_team_member") {
        if (!body.user_id || !body.group_id) return send(response, 400, { error: "user_id và group_id là bắt buộc" });
        await db("team_memberships?on_conflict=user_id,group_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: body.user_id, parent_user_id: body.parent_user_id || null, group_id: body.group_id, role: body.role || "operator", status: body.status || "active", note: body.note || null }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "set_reporting_line") {
        const employeeId = String(body.employee_user_id || "");
        const managerId = String(body.manager_user_id || "");
        if (!employeeId || !managerId || employeeId === managerId) return send(response, 400, { error: "Nhân viên và quản lý phải là hai tài khoản khác nhau" });
        const lines = await db("user_reporting_lines?select=employee_user_id,manager_user_id&status=eq.active&limit=10000").catch(() => []);
        const parentByEmployee = new Map(lines.filter(row => row.employee_user_id !== employeeId).map(row => [String(row.employee_user_id), String(row.manager_user_id)]));
        let cursor = managerId;
        for (let i = 0; i < 100 && cursor; i++) { if (cursor === employeeId) return send(response, 409, { error: "Không thể tạo vòng lặp tuyến quản lý" }); cursor = parentByEmployee.get(cursor); }
        await db("user_reporting_lines?on_conflict=employee_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ employee_user_id: employeeId, manager_user_id: managerId, status: "active", effective_from: body.effective_from || new Date().toISOString().slice(0, 10), ended_at: null, created_by: context.user.id, note: body.note || null, updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true, employee_user_id: employeeId, manager_user_id: managerId });
      }
      if (body.action === "set_reporting_lines") {
        const managerId = String(body.manager_user_id || "");
        const employeeIds = [...new Set((Array.isArray(body.employee_user_ids) ? body.employee_user_ids : []).map(String).filter(Boolean))];
        if (!managerId || !employeeIds.length) return send(response, 400, { error: "Quản lý và danh sách nhân viên là bắt buộc" });
        if (employeeIds.includes(managerId)) return send(response, 400, { error: "Quản lý không thể đồng thời là nhân viên của chính mình" });
        const lines = await db("user_reporting_lines?select=employee_user_id,manager_user_id&status=eq.active&limit=10000").catch(() => []);
        const parentByEmployee = new Map(lines.map(row => [String(row.employee_user_id), String(row.manager_user_id)]));
        const now = new Date().toISOString();
        for (const employeeId of employeeIds) {
          const parents = new Map(parentByEmployee);
          parents.delete(employeeId);
          let cursor = managerId;
          for (let i = 0; i < 100 && cursor; i++) { if (cursor === employeeId) return send(response, 409, { error: `Không thể tạo vòng lặp tuyến cho nhân viên ${employeeId}` }); cursor = parents.get(cursor); }
        }
        await db("user_reporting_lines?on_conflict=employee_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(employeeIds.map(employee_user_id => ({ employee_user_id, manager_user_id: managerId, status: "active", effective_from: body.effective_from || now.slice(0, 10), ended_at: null, created_by: context.user.id, note: body.note || null, updated_at: now }))) });
        return send(response, 200, { ok: true, manager_user_id: managerId, employee_user_ids: employeeIds });
      }
      if (body.action === "end_reporting_line") {
        const employeeId = String(body.employee_user_id || "");
        if (!employeeId) return send(response, 400, { error: "employee_user_id là bắt buộc" });
        await db(`user_reporting_lines?employee_user_id=eq.${encodeURIComponent(employeeId)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "end_reporting_lines") {
        const employeeIds = [...new Set((Array.isArray(body.employee_user_ids) ? body.employee_user_ids : []).map(String).filter(Boolean))];
        if (!employeeIds.length) return send(response, 400, { error: "Chưa chọn quan hệ để kết thúc" });
        await db(`user_reporting_lines?employee_user_id=in.(${employeeIds.map(encodeURIComponent).join(",")})&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true, employee_user_ids: employeeIds });
      }
      if (body.action === "set_user_status") {
        const userId = String(body.user_id || "");
        const status = ["active", "suspended", "deleted"].includes(body.status) ? body.status : "active";
        if (!userId) return send(response, 400, { error: "user_id là bắt buộc" });
        const now = new Date().toISOString();
        await db(`profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, suspended_at: status === "suspended" ? now : null, deleted_at: status === "deleted" ? now : null, updated_at: now }) });
        if (status !== "active") await db(`page_access?user_id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "suspended" }) });
        return send(response, 200, { ok: true, status });
      }
      if (body.action === "set_user_role") {
        const userId = String(body.user_id || "");
        if (!userId || !["viewer", "analyst", "operator", "manager", "platform_admin", "super_admin"].includes(body.role)) return send(response, 400, { error: "user_id hoặc role không hợp lệ" });
        await db(`profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ role: body.role, updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "delete_user") {
        const userId = String(body.user_id || "");
        if (!userId) return send(response, 400, { error: "user_id là bắt buộc" });
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const result = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
        if (!result.ok) throw new Error(`Supabase Auth ${result.status}: ${await result.text()}`);
        return send(response, 200, { ok: true, deleted_user_id: userId });
      }
      if (body.action === "offboard_user") {
        const userId = String(body.user_id || "");
        const successorId = String(body.successor_user_id || "");
        if (!userId || !successorId || userId === successorId) return send(response, 400, { error: "Phải chọn người tiếp quản khác tài khoản cũ" });
        const [accessRows, assignmentRows, paymentRows, teamRows, reportingAsEmployee, reportingAsManager, salesAssignments] = await Promise.all([
          db(`page_access?select=page_id,access_level&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`),
          db(`page_assignments?select=page_id,group_name,topic,assignment_role,note&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`payment_profile_access?select=payment_profile_id,access_level&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`team_memberships?select=group_id,role,note&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`user_reporting_lines?select=manager_user_id&employee_user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`user_reporting_lines?select=employee_user_id&manager_user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`sales_order_assignments?select=order_id,assignee_user_id,manager_user_id&or=(assignee_user_id.eq.${encodeURIComponent(userId)},manager_user_id.eq.${encodeURIComponent(userId)})`).catch(() => [])
        ]);
        for (const row of accessRows) await db("page_access?on_conflict=user_id,page_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, page_id: row.page_id, access_level: row.access_level, status: "active", granted_by: context.user.id }) });
        for (const row of assignmentRows) await db("page_assignments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ page_id: row.page_id, user_id: successorId, group_name: row.group_name, topic: row.topic, assignment_role: row.assignment_role, status: "active", note: `Tiếp quản từ ${userId}: ${row.note || ""}` }) });
        for (const row of paymentRows) await db("payment_profile_access?on_conflict=user_id,payment_profile_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, payment_profile_id: row.payment_profile_id, access_level: row.access_level, status: "active", granted_by: context.user.id }) });
        for (const row of teamRows) await db("team_memberships?on_conflict=user_id,group_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, group_id: row.group_id, role: row.role, status: "active", note: `Tiếp quản từ ${userId}: ${row.note || ""}` }) });
        for (const row of salesAssignments) await db(`sales_order_assignments?order_id=eq.${encodeURIComponent(row.order_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ assignee_user_id: String(row.assignee_user_id) === userId ? successorId : row.assignee_user_id, manager_user_id: String(row.manager_user_id) === userId ? successorId : row.manager_user_id, assigned_by: context.user.id, assigned_at: new Date().toISOString(), handover_note: `Bàn giao tài khoản từ ${userId}` }) });
        const now = new Date().toISOString();
        const previousManager = reportingAsEmployee[0]?.manager_user_id || null;
        if (previousManager && previousManager !== successorId) await db("user_reporting_lines?on_conflict=employee_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ employee_user_id: successorId, manager_user_id: previousManager, status: "active", effective_from: now.slice(0, 10), created_by: context.user.id, note: `Tiếp quản tuyến từ ${userId}`, updated_at: now }) });
        for (const row of reportingAsManager) if (row.employee_user_id !== successorId) await db(`user_reporting_lines?employee_user_id=eq.${encodeURIComponent(row.employee_user_id)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ manager_user_id: successorId, updated_at: now, note: `Chuyển tuyến từ ${userId}` }) });
        await Promise.all([
          db(`page_access?user_id=eq.${encodeURIComponent(userId)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended" }) }),
          db(`page_assignments?user_id=eq.${encodeURIComponent(userId)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: now }) }),
          db(`payment_profile_access?user_id=eq.${encodeURIComponent(userId)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended" }) }),
          db(`team_memberships?user_id=eq.${encodeURIComponent(userId)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: now }) }),
          db(`user_reporting_lines?or=(employee_user_id.eq.${encodeURIComponent(userId)},manager_user_id.eq.${encodeURIComponent(userId)})&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: now, updated_at: now }) }),
          db(`profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: body.final_status === "deleted" ? "deleted" : "suspended", suspended_at: now, deleted_at: body.final_status === "deleted" ? now : null, updated_at: now }) })
        ]);
        if (body.final_status === "deleted") {
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const result = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
          if (!result.ok) throw new Error(`Supabase Auth ${result.status}: ${await result.text()}`);
        }
        const transferred = { pages: accessRows.length, assignments: assignmentRows.length, payment_profiles: paymentRows.length, team_memberships: teamRows.length, reporting_lines: reportingAsEmployee.length + reportingAsManager.length, sales_orders: salesAssignments.length };
        await db("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actor_user_id: context.user.id, action: "offboard_user", target_type: "profile", target_id: userId, details: { successor_user_id: successorId, final_status: body.final_status === "deleted" ? "deleted" : "suspended", transferred } }) });
        return send(response, 200, { ok: true, transferred, successor_user_id: successorId });
      }
      if (body.action === "grant_payment_profile") {
        if (!body.user_id || !body.payment_profile_id) return send(response, 400, { error: "user_id và payment_profile_id là bắt buộc" });
        await db("payment_profile_access?on_conflict=user_id,payment_profile_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: body.user_id, payment_profile_id: body.payment_profile_id, access_level: body.access_level === "manager" ? "manager" : "viewer", status: "active", granted_by: context.user.id }) });
        return send(response, 200, { ok: true });
      }
      if (body.action === "set_commission") {
        if (!body.page_id || !body.user_id) return send(response, 400, { error: "page_id và user_id là bắt buộc" });
        await db("page_commissions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ page_id: String(body.page_id), user_id: body.user_id, share_percent: Number(body.share_percent || 0), effective_from: body.effective_from || new Date().toISOString().slice(0, 10), effective_until: body.effective_until || null, status: body.status || "active", note: body.note || null, created_by: context.user.id, updated_at: new Date().toISOString() }) });
        return send(response, 200, { ok: true });
      }
      const userId = String(body.user_id || "");
      const pageId = String(body.page_id || "");
      if (!userId || !pageId) return send(response, 400, { error: "user_id và page_id là bắt buộc" });
      if (body.granted === false) {
        await db(`page_access?user_id=eq.${encodeURIComponent(userId)}&page_id=eq.${encodeURIComponent(pageId)}`, { method: "DELETE" });
      } else {
        await db("page_access?on_conflict=user_id,page_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, page_id: pageId, access_level: body.access_level === "manager" ? "manager" : "viewer", status: "active", granted_by: context.user.id }) });
      }
      return send(response, 200, { ok: true });
    }
    return send(response, 405, { error: "Method not allowed" });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message }); }
}
