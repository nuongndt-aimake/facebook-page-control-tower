const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function requireAdmin(request, allowCron = false) {
  const expected = process.env.DASHBOARD_ADMIN_KEY;
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const supplied = request.headers["x-admin-key"] || bearer;
  const cronOK = allowCron && bearer === process.env.CRON_SECRET;
  if (!expected || (!cronOK && supplied !== expected)) throw new Error("Unauthorized");
}

export async function authenticatedUser(request) {
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!bearer) throw new Error("Unauthorized");
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`;
  const response = await fetch(url, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}` } });
  if (!response.ok) throw new Error("Unauthorized");
  return { ...(await response.json()), access_token: bearer };
}

export async function accessContext(request) {
  const user = await authenticatedUser(request);
  let rows = await db(`profiles?select=id,email,display_name,role,status&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  if (!rows.length) {
    const configured = (process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
    const role = configured && user.email?.toLowerCase() === configured ? "platform_admin" : "viewer";
    await db("profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: user.id, email: user.email || null, display_name: user.user_metadata?.full_name || user.email || null, role }) });
    rows = [{ id: user.id, email: user.email, display_name: user.user_metadata?.full_name || user.email, role, status: "active" }];
  }
  const profile = rows[0];
  if (profile.status === "suspended" || profile.status === "deleted") throw new Error("Forbidden");
  if (profile.role === "platform_admin" || profile.role === "super_admin") return { user, profile, pageIds: [], paymentProfileIds: [], assignments: [], visibleUserIds: [user.id], managedUserIds: [], directPageIds: [], inheritedPageIds: [], pageSources: {} };
  const memberships = await db("team_memberships?select=user_id,parent_user_id,group_id,role&status=eq.active&limit=10000").catch(() => []);
  const visibleUserIds = new Set([user.id]);
  let changed = true;
  while (changed) { changed = false; for (const row of memberships) if (row.parent_user_id && visibleUserIds.has(row.parent_user_id) && !visibleUserIds.has(row.user_id)) { visibleUserIds.add(row.user_id); changed = true; } }
  const ids = [...visibleUserIds].map(encodeURIComponent).join(",");
  const [accessRows, assignmentRows, paymentRows] = await Promise.all([
    db(`page_access?select=page_id,user_id&user_id=in.(${ids})&status=eq.active`),
    db(`page_assignments?select=page_id,assignment_role,group_name,topic,user_id&user_id=in.(${ids})&status=eq.active`),
    db(`payment_profile_access?select=payment_profile_id&user_id=in.(${ids})&status=eq.active`).catch(() => [])
  ]);
  const pageIds = [...new Set([...accessRows.map(row => row.page_id), ...assignmentRows.map(row => row.page_id)])];
  const paymentProfileIds = [...new Set(paymentRows.map(row => row.payment_profile_id))];
  const sourceMap = {};
  const addSource = (pageId, ownerId, source) => {
    const key = String(pageId);
    const item = sourceMap[key] || { direct: false, inherited: false, user_ids: [] };
    item[source] = true;
    if (ownerId && !item.user_ids.includes(String(ownerId))) item.user_ids.push(String(ownerId));
    sourceMap[key] = item;
  };
  for (const row of accessRows) addSource(row.page_id, row.user_id, String(row.user_id) === String(user.id) ? "direct" : "inherited");
  for (const row of assignmentRows) addSource(row.page_id, row.user_id, String(row.user_id) === String(user.id) ? "direct" : "inherited");
  const directPageIds = Object.entries(sourceMap).filter(([, item]) => item.direct).map(([id]) => id);
  const inheritedPageIds = Object.entries(sourceMap).filter(([, item]) => item.inherited && !item.direct).map(([id]) => id);
  return { user, profile, pageIds, paymentProfileIds, assignments: assignmentRows, visibleUserIds: [...visibleUserIds], managedUserIds: [...visibleUserIds].filter(id => String(id) !== String(user.id)), directPageIds, inheritedPageIds, pageSources: sourceMap };
}

export async function requireViewer(request) {
  return accessContext(request);
}

export async function requirePlatformAdmin(request) {
  const context = await accessContext(request);
  if (context.profile.role !== "platform_admin") throw new Error("Forbidden");
  return context;
}

export async function connections() {
  const raw = process.env.META_CONNECTIONS_JSON;
  let items;
  if (raw) {
    try { items = JSON.parse(raw); } catch { throw new Error("META_CONNECTIONS_JSON must be valid JSON"); }
  } else {
    const stored = await db("meta_connections?select=id,label,user_access_token,business_ids,page_ids,token_expires_at&order=updated_at.desc");
    items = stored.map(item => ({
      ...item,
      business_ids: Array.isArray(item.business_ids) ? item.business_ids : [],
      page_ids: Array.isArray(item.page_ids) ? item.page_ids : []
    }));
  }
  if (!Array.isArray(items) || !items.length) throw new Error("Chưa có kết nối Meta. Hãy kết nối tài khoản quản trị Page trước.");
  return items.map((item, i) => {
    if (!item.label || !item.user_access_token) throw new Error(`Connection ${i + 1} is missing label or user_access_token`);
    if (item.business_ids && !Array.isArray(item.business_ids)) throw new Error(`Connection ${i + 1}: business_ids must be an array`);
    if (item.page_ids && !Array.isArray(item.page_ids)) throw new Error(`Connection ${i + 1}: page_ids must be an array`);
    return item;
  });
}

export async function graph(path, token, params = {}) {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(`Meta ${response.status}: ${body?.error?.message || "Unknown error"}`);
  return body;
}

export async function graphPost(path, token, fields = {}) {
  const url = `${GRAPH}/${path.replace(/^\//, "")}`;
  const body = new URLSearchParams({ ...fields, access_token: token });
  const response = await fetch(url, { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(`Meta ${response.status}: ${data?.error?.message || "Unknown error"}`);
  return data;
}

export async function graphPages(path, token, params = {}) {
  const all = [];
  let next = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => next.searchParams.set(key, value));
  while (next) {
    const response = await fetch(next);
    const body = await response.json();
    if (!response.ok) throw new Error(`Meta ${response.status}: ${body?.error?.message || "Unknown error"}`);
    all.push(...(body.data || []));
    next = body.paging?.next ? new URL(body.paging.next) : null;
  }
  return all;
}

// Pages normally arrive through /me/accounts.  For a Page held by a Business
// Portfolio, the owner can optionally supply business_ids or page_ids as a
// reliable fallback. Page tokens are never persisted; they exist only during
// the current serverless run.
export async function resolveConnectionPages(connection, options = {}) {
  const token = connection.user_access_token;
  const requestedPageIds = Array.isArray(options.pageIds) ? options.pageIds.map(String).filter(Boolean) : [];
  const found = new Map();
  const businessNames = new Map();
  const warnings = [];
  const add = async (page, source = "personal", businessId = null) => {
    if (!page?.id) return;
    const existing = found.get(String(page.id));
    if (existing) {
      if (businessId && !existing.custodian_business_id) {
        existing.custodian_business_id = String(businessId);
        existing.asset_scope = "bm";
      }
      return;
    }
    if (!page.access_token) {
      try {
        // `tasks` is not returned consistently for direct Page reads on newer
        // Graph versions; keep the token bootstrap request to stable fields.
        page = await graph(page.id, token, { fields: "id,name,category,access_token" });
      } catch (error) {
        warnings.push(`${page.id}: không lấy được Page token (${error.message})`);
        return;
      }
    }
    if (page.access_token) found.set(page.id, { ...page, custodian_business_id: businessId ? String(businessId) : null, custodian_business_name: businessId ? (businessNames.get(String(businessId)) || null) : null, managed_by_connection: connection.label || null, asset_scope: businessId ? "bm" : source });
    else warnings.push(`${page.id}: token không có quyền truy cập Page`);
  };
  if (requestedPageIds.length) {
    for (const pageId of requestedPageIds) await add({ id: pageId }, "configured");
    return { pages: [...found.values()], businesses: [], warnings };
  }
  try {
    const direct = await graphPages("me/accounts", token, { fields: "id,name,category,tasks,access_token", limit: "100" });
    for (const page of direct) await add(page, "personal");
  } catch (error) { warnings.push(`/me/accounts: ${error.message}`); }
  for (const businessId of connection.business_ids || []) {
    try {
      try {
        const business = await graph(String(businessId), token, { fields: "id,name" });
        if (business?.name) businessNames.set(String(businessId), business.name);
      } catch (error) { warnings.push(`BM ${businessId}: không đọc được tên BM (${error.message})`); }
      const owned = await graphPages(`${businessId}/owned_pages`, token, { fields: "id,name,category,tasks", limit: "100" });
      for (const page of owned) await add(page, "bm", businessId);
    } catch (error) { warnings.push(`BM ${businessId}: ${error.message}`); }
  }
  for (const pageId of connection.page_ids || []) await add({ id: String(pageId) }, "configured");
  return { pages: [...found.values()].map(page => ({ ...page, custodian_business_name: page.custodian_business_name || (page.custodian_business_id ? businessNames.get(String(page.custodian_business_id)) || null : null) })), businesses: [...businessNames.entries()].map(([id, name]) => ({ id, name })), warnings };
}

function dbUrl(path) { return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`; }
function dbHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error("Supabase server credentials are missing");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
export async function db(path, options = {}) {
  const response = await fetch(dbUrl(path), { ...options, headers: dbHeaders(options.headers) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
export async function upsert(table, records, conflict = "id") {
  if (!records.length) return;
  return db(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(records)
  });
}
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export const yesterdayUTC = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
export function send(response, status, payload) { return response.status(status).json(payload); }
export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === "string") return value.replace(/(access_token|user_access_token|page_access_token|app_secret|client_secret|authorization)\s*[:=]\s*[^,\s}&]+/gi, "$1=[REDACTED]");
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => (/token|secret|authorization/i.test(key) ? [key, "[REDACTED]"] : [key, redactSecrets(item)])));
  return value;
}
export async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}
