import { accessContext, createAdminPreviewToken, db, readBody, send } from "../_lib.mjs";
import { runSync, runOrchestratedSync, runPostSync } from "../cron/sync.mjs";

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

export default async function handler(request, response) {
  try {
    const context = await accessContext(request);
    const endpoint = new URL(request.url, "http://localhost").searchParams.get("endpoint");
    if (endpoint === "preview") return await startPreview(request, response, context);
    const isAdmin = context.profile.role === "platform_admin" || context.profile.role === "super_admin";
    if (request.method === "GET") {
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
        const [accessRows, assignmentRows, paymentRows, teamRows, reportingAsEmployee, reportingAsManager] = await Promise.all([
          db(`page_access?select=page_id,access_level&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`),
          db(`page_assignments?select=page_id,group_name,topic,assignment_role,note&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`payment_profile_access?select=payment_profile_id,access_level&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`team_memberships?select=group_id,role,note&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`user_reporting_lines?select=manager_user_id&employee_user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => []),
          db(`user_reporting_lines?select=employee_user_id&manager_user_id=eq.${encodeURIComponent(userId)}&status=eq.active`).catch(() => [])
        ]);
        for (const row of accessRows) await db("page_access?on_conflict=user_id,page_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, page_id: row.page_id, access_level: row.access_level, status: "active", granted_by: context.user.id }) });
        for (const row of assignmentRows) await db("page_assignments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ page_id: row.page_id, user_id: successorId, group_name: row.group_name, topic: row.topic, assignment_role: row.assignment_role, status: "active", note: `Tiếp quản từ ${userId}: ${row.note || ""}` }) });
        for (const row of paymentRows) await db("payment_profile_access?on_conflict=user_id,payment_profile_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, payment_profile_id: row.payment_profile_id, access_level: row.access_level, status: "active", granted_by: context.user.id }) });
        for (const row of teamRows) await db("team_memberships?on_conflict=user_id,group_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: successorId, group_id: row.group_id, role: row.role, status: "active", note: `Tiếp quản từ ${userId}: ${row.note || ""}` }) });
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
        const transferred = { pages: accessRows.length, assignments: assignmentRows.length, payment_profiles: paymentRows.length, team_memberships: teamRows.length, reporting_lines: reportingAsEmployee.length + reportingAsManager.length };
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
