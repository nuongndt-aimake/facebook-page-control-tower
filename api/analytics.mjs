import { randomUUID } from "node:crypto";
import { accessContext, assertMutableContext, db, requireViewer, readBody, send } from "./_lib.mjs";

const TZ = "Asia/Ho_Chi_Minh";
const dateInVietnam = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date()).replace(/\//g, "-");
const shift = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const monthStart = date => `${date.slice(0, 7)}-01`;
const ranges = () => {
  const today = dateInVietnam(), thisMonth = monthStart(today), previousEnd = shift(thisMonth, -1), previousStart = monthStart(previousEnd);
  return {
    day: { start: today, end: today, label: "Hôm nay" },
    "7d": { start: shift(today, -6), end: today, label: "7 ngày" },
    "28d": { start: shift(today, -27), end: today, label: "28 ngày" },
    "60d": { start: shift(today, -59), end: today, label: "60 ngày" },
    "90d": { start: shift(today, -89), end: today, label: "90 ngày" },
    "365d": { start: shift(today, -364), end: today, label: "365 ngày" },
    this_month: { start: thisMonth, end: today, label: "Tháng này" },
    last_month: { start: previousStart, end: previousEnd, label: "Tháng trước" }
  };
};
const number = value => typeof value === "number" ? value : (typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : 0);
const parse = value => { try { return JSON.parse(value); } catch { return value; } };
const metricNumber = (value, metric = "") => {
  const parsed = parse(value);
  if (typeof parsed === "number" || typeof parsed === "string") return number(parsed);
  if (parsed && typeof parsed === "object") {
    if (parsed.microAmount !== undefined || parsed.micro_amount !== undefined) {
      const micro = number(parsed.microAmount ?? parsed.micro_amount);
      return metric === "content_monetization_earnings" ? micro / 1000000 : micro;
    }
    return number(parsed.value ?? parsed.amount ?? parsed.total);
  }
  return 0;
};
const metricMap = process.env.META_REPORT_VIEW_METRICS ? process.env.META_REPORT_VIEW_METRICS.split(",").map(v => v.trim()).filter(Boolean) : [];
const interactionStats = post => {
  const raw = post.raw_json || {};
  const comments = Number(raw.comments?.summary?.total_count ?? raw.comments?.data?.length ?? 0) || 0;
  const shares = Number(raw.shares?.count ?? 0) || 0;
  const reactions = Number(raw.reactions?.summary?.total_count ?? 0) || 0;
  return { comments, shares, reactions, total: comments + shares + reactions };
};
const adminRoles = new Set(["platform_admin", "super_admin"]);
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;

async function handlePublication(request, response, context) {
  assertMutableContext(context);
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
  const body = await readBody(request);
  const postId = String(body.post_id || "").trim();
  const pageId = body.page_id ? String(body.page_id).trim() : null;
  const publisherPageId = body.publisher_page_id ? String(body.publisher_page_id).trim() : pageId;
  const destinationType = body.destination_type === "community" ? "community" : "page";
  if (!postId) return send(response, 400, { error: "post_id là bắt buộc" });
  const postRows = await db(`posts?select=id,page_id&id=eq.${encodeURIComponent(postId)}&limit=1`);
  const effectivePageId = publisherPageId || postRows[0]?.page_id || null;
  if (destinationType === "community" && !publisherPageId) return send(response, 400, { error: "publisher_page_id là bắt buộc khi Page đăng vào cộng đồng" });
  if (effectivePageId && !adminRoles.has(context.profile.role) && !context.pageIds.includes(String(effectivePageId))) throw new Error("Forbidden");
  if (!postRows[0]) {
    if (destinationType !== "community" || !body.community_id) return send(response, 404, { error: "Bài viết chưa có trong registry; bài cộng đồng mới cần community_id" });
    await db("posts?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({
      id: postId, page_id: null, created_time: body.published_at || null, message: body.message || null,
      permalink_url: body.external_url || null, media_type: body.media_type || null, raw_json: body.metadata || {},
      synced_at: new Date().toISOString(), origin_type: "community", source_group_id: String(body.community_id), source_group_name: body.community_name || null,
      external_url: body.external_url || null, ingested_source: body.discovered_source === "meta" ? "meta" : (body.discovered_source === "manual" ? "manual" : "extension"), discovered_by: context.user.id
    }) });
  }
  const publicationKey = String(body.publication_key || randomUUID());
  await db("post_publications?on_conflict=publication_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({
    post_id: postId, page_id: effectivePageId, publisher_page_id: publisherPageId, publisher_page_name: body.publisher_page_name || null,
    editor_user_id: context.user.id, published_as: body.published_as === "profile" ? "profile" : "page", destination_type: destinationType,
    community_id: body.community_id || null, community_name: body.community_name || null, community_url: body.community_url || null,
    published_at: body.published_at || null, external_url: body.external_url || null,
    discovered_source: body.discovered_source === "meta" ? "meta" : (body.discovered_source === "manual" ? "manual" : "extension"),
    discovered_by: context.user.id, verification_status: "pending", metadata: body.metadata || {}, publication_key: publicationKey, updated_at: new Date().toISOString()
  }) });
  return send(response, 202, { ok: true, publication_key: publicationKey, post_id: postId, page_id: effectivePageId, destination_type: destinationType });
}

async function handlePostSyncRequest(request, response, context) {
  if (request.method === "POST") assertMutableContext(context);
  const admin = adminRoles.has(context.profile.role);
  if (request.method === "POST") {
    const body = await readBody(request);
    const postIds = [...new Set((Array.isArray(body.post_ids) ? body.post_ids : [body.post_id]).map(value => String(value || "").trim()).filter(Boolean))].slice(0, 100);
    if (!postIds.length) return send(response, 400, { error: "post_ids là bắt buộc" });
    const today = new Date().toISOString().slice(0, 10);
    const windowStart = isoDate(body.window_start) || today;
    const windowEnd = isoDate(body.window_end) || today;
    if (windowStart > windowEnd) return send(response, 400, { error: "window_start không được sau window_end" });
    const requestedMetrics = Array.isArray(body.metric_names) ? body.metric_names.map(value => String(value).trim()).filter(Boolean).slice(0, 30) : [];
    const posts = await db(`posts?select=id,page_id&id=in.(${postIds.map(encodeURIComponent).join(",")})&limit=100`);
    const visible = admin ? posts : posts.filter(post => context.pageIds.includes(String(post.page_id)));
    if (!visible.length) throw new Error("Forbidden");
    const requests = visible.map(post => ({
      post_id: String(post.id), requested_by: context.user.id, window_start: windowStart, window_end: windowEnd,
      metric_names: requestedMetrics, status: "pending", idempotency_key: String(body.idempotency_key || randomUUID()) + `:${post.id}`
    }));
    await db("post_sync_requests?on_conflict=idempotency_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(requests) });
    return send(response, 202, { ok: true, requested: requests.length, post_ids: visible.map(post => post.id), window_start: windowStart, window_end: windowEnd });
  }
  if (request.method === "GET") {
    const postId = new URL(request.url, `https://${request.headers.host}`).searchParams.get("post_id");
    if (!postId) return send(response, 400, { error: "post_id là bắt buộc" });
    const posts = await db(`posts?select=id,page_id&id=eq.${encodeURIComponent(postId)}&limit=1`);
    if (!posts[0]) return send(response, 404, { error: "Không tìm thấy bài viết" });
    if (!admin && !context.pageIds.includes(String(posts[0].page_id))) throw new Error("Forbidden");
    const [requests, snapshots] = await Promise.all([
      db(`post_sync_requests?select=*&post_id=eq.${encodeURIComponent(postId)}&order=created_at.desc&limit=100`),
      db(`post_metric_snapshots?select=*&post_id=eq.${encodeURIComponent(postId)}&order=observed_at.desc&limit=100`)
    ]);
    return send(response, 200, { post_id: postId, requests, snapshots });
  }
  return send(response, 405, { error: "Method not allowed" });
}

export default async function handler(request, response) {
  try {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    const url = new URL(request.url, `https://${request.headers.host}`);
    const action = url.searchParams.get("action");
    if (action === "publication" || action === "sync-request") {
      const context = await accessContext(request);
      return action === "publication" ? await handlePublication(request, response, context) : await handlePostSyncRequest(request, response, context);
    }
    const context = await requireViewer(request);
    const key = url.searchParams.get("period") || "7d";
    const range = ranges()[key];
    if (!range) return send(response, 400, { error: "period must be day, 7d, 28d, 60d, 90d, 365d, this_month or last_month" });
    const requestedPage = url.searchParams.get("page_id") || null;
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const assetScope = url.searchParams.get("asset_scope") || "";
    const businessId = url.searchParams.get("business_id") || "";
    const paymentProfileId = url.searchParams.get("payment_profile_id") || "";
    const groupId = url.searchParams.get("group_id") || "";
    const pageNumber = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") || 200)));
    const postNumber = Math.max(1, Number(url.searchParams.get("posts_page") || 1));
    const postSize = Math.min(200, Math.max(1, Number(url.searchParams.get("posts_page_size") || 200)));
    const pageId = requestedPage || null;
    const restricted = !["platform_admin", "super_admin"].includes(context.profile.role);
    if (restricted && requestedPage && !context.pageIds.includes(requestedPage)) return send(response, 403, { error: "Bạn không được cấp quyền xem Page này" });
    const allowed = restricted ? context.pageIds : null;
    const accessFilter = allowed
      ? (allowed.length ? `&id=in.(${allowed.map(encodeURIComponent).join(",")})` : "&id=eq.__none__")
      : "";
    const postStart = `${range.start}T00:00:00+07:00`, postEnd = `${shift(range.end, 1)}T00:00:00+07:00`;
    const pageFilter = pageId ? `&page_id=eq.${encodeURIComponent(pageId)}` : "";
    const [pages, posts, metricRows, revenue, syncRuns, pageSnapshots, postSnapshots, postSyncRequests, paymentLinks, paymentProfiles, pageGroups, contentGroups] = await Promise.all([
      db(`pages?select=id,name,category,meta_connection,managed_by_connection,asset_scope,custodian_business_id,custodian_business_name,last_synced_at,updated_at${pageId ? `&id=eq.${encodeURIComponent(pageId)}` : accessFilter}&order=name.asc&limit=5000`).catch(() => db(`pages?select=id,name,category,meta_connection,custodian_business_id,updated_at${pageId ? `&id=eq.${encodeURIComponent(pageId)}` : accessFilter}&order=name.asc&limit=5000`)),
      db(`posts?select=id,page_id,created_time,message,permalink_url,media_type,raw_json,synced_at&created_time=gte.${encodeURIComponent(postStart)}&created_time=lt.${encodeURIComponent(postEnd)}${pageFilter}&order=created_time.desc&limit=20000`),
      db(`metrics?select=entity_type,entity_id,metric,period,end_time,value_json,synced_at&end_time=gte.${encodeURIComponent(`${range.start}T00:00:00+00:00`)}&end_time=lte.${encodeURIComponent(`${shift(range.end, 1)}T23:59:59+00:00`)}&limit=100000`),
      db(`revenue_entries?select=page_id,payment_profile_id,period_start,period_end,gross_amount,currency,source,note&period_start=lte.${range.end}&period_end=gte.${range.start}${pageFilter}${allowed ? `&page_id=in.(${allowed.map(encodeURIComponent).join(",")})` : ""}&order=period_start.desc&limit=5000`),
      db("sync_runs?select=ran_at,since_date,until_date,status,summary&order=ran_at.desc&limit=1").catch(() => []),
      db(`page_daily_snapshots?select=page_id,snapshot_date,window_start,window_end,status,posts_count,metrics_json,observed_at&snapshot_date=gte.${encodeURIComponent(range.start)}&snapshot_date=lte.${encodeURIComponent(range.end)}${pageId ? `&page_id=eq.${encodeURIComponent(pageId)}` : (allowed ? `&page_id=in.(${allowed.map(encodeURIComponent).join(",")})` : "")}&order=observed_at.desc&limit=50000`).catch(() => []),
      db(`post_metric_snapshots?select=post_id,status,comments_count,reactions_count,shares_count,window_start,window_end,observed_at&window_end=gte.${encodeURIComponent(range.start)}&window_start=lte.${encodeURIComponent(range.end)}&order=observed_at.desc&limit=50000`).catch(() => []),
      db("post_sync_requests?select=post_id,status,attempt_count,last_error,updated_at,completed_at,window_start,window_end&order=updated_at.desc&limit=50000").catch(() => []),
      db("page_payment_profiles?select=page_id,payment_profile_id,relation_type&limit=20000").catch(() => []),
      db("payment_profiles?select=id,external_id,profile_name,recipient_name,recipient_account,receiving_account_name,status,business_id&limit=5000").catch(() => [])
      ,db("page_group_assignments?select=page_id,group_id,status&status=eq.active&limit=20000").catch(() => [])
      ,db("content_groups?select=id,name,parent_group_id,status&status=eq.active&limit=5000").catch(() => [])
    ]);
    const visiblePaymentProfileIds = restricted ? new Set(context.paymentProfileIds || []) : null;
    const visiblePaymentProfiles = visiblePaymentProfileIds ? paymentProfiles.filter(profile => visiblePaymentProfileIds.has(profile.id)) : paymentProfiles;
    const paymentByPage = new Map();
    for (const link of paymentLinks) {
      if (!paymentByPage.has(link.page_id)) paymentByPage.set(link.page_id, []);
      const profile = visiblePaymentProfiles.find(item => String(item.id) === String(link.payment_profile_id));
      if (profile) paymentByPage.get(link.page_id).push({ ...profile, relation_type: link.relation_type });
    }
    const groupsByPage = new Map();
    for (const link of pageGroups) { const group = contentGroups.find(item => String(item.id) === String(link.group_id)); if (!group) continue; if (!groupsByPage.has(link.page_id)) groupsByPage.set(link.page_id, []); groupsByPage.get(link.page_id).push(group); }
    const reportRevenue = visiblePaymentProfileIds ? revenue.filter(row => row.payment_profile_id && visiblePaymentProfileIds.has(row.payment_profile_id)) : revenue;
    const filteredPages = pages.filter(page => (!assetScope || (page.asset_scope || (page.custodian_business_id ? "bm" : "personal")) === assetScope) && (!businessId || String(page.custodian_business_id || "") === String(businessId)) && (!paymentProfileId || paymentByPage.get(page.id)?.some(profile => String(profile.id) === String(paymentProfileId))) && (!groupId || groupsByPage.get(page.id)?.some(group => String(group.id) === String(groupId))) && (!query || `${page.name} ${page.id}`.toLowerCase().includes(query)));
    const pageIds = new Set(filteredPages.map(page => page.id));
    const pageNames = new Map(filteredPages.map(page => [page.id, page.name]));
    const scopedPosts = (allowed ? posts.filter(post => pageIds.has(post.page_id)) : posts.filter(post => pageIds.has(post.page_id)));
    const postIds = new Set(scopedPosts.map(post => post.id));
    const latestPostSnapshots = new Map();
    for (const snapshot of (Array.isArray(postSnapshots) ? postSnapshots : [])) {
      const key = String(snapshot.post_id);
      if (postIds.has(key) && !latestPostSnapshots.has(key)) latestPostSnapshots.set(key, snapshot);
    }
    const latestPostSyncRequests = new Map();
    for (const request of (Array.isArray(postSyncRequests) ? postSyncRequests : [])) {
      const key = String(request.post_id);
      if (postIds.has(key) && !latestPostSyncRequests.has(key)) latestPostSyncRequests.set(key, request);
    }
    const postSyncState = post => {
      const request = latestPostSyncRequests.get(String(post.id));
      if (request) return { status: request.status, updated_at: request.updated_at, completed_at: request.completed_at, error: request.last_error || null };
      return { status: post.synced_at ? "discovered" : "never_seen", updated_at: post.synced_at || null, completed_at: null, error: null };
    };
    const postStats = post => {
      const snapshot = latestPostSnapshots.get(String(post.id));
      if (!snapshot) return interactionStats(post);
      const comments = Number(snapshot.comments_count || 0), reactions = Number(snapshot.reactions_count || 0), shares = Number(snapshot.shares_count || 0);
      return { comments, shares, reactions, total: comments + shares + reactions, observed_at: snapshot.observed_at, status: snapshot.status };
    };
    const totals = {}, perEntity = new Map();
    for (const row of metricRows) {
      if ((row.entity_type === "page" && !pageIds.has(row.entity_id)) || (row.entity_type === "post" && !postIds.has(row.entity_id))) continue;
      const value = metricNumber(row.value_json, row.metric);
      if (!value) continue;
      totals[row.metric] = row.metric === "page_follows" ? Math.max(totals[row.metric] || 0, value) : (totals[row.metric] || 0) + value;
      const entity = perEntity.get(row.entity_id) || {};
      entity[row.metric] = row.metric === "page_follows" ? Math.max(entity[row.metric] || 0, value) : (entity[row.metric] || 0) + value;
      perEntity.set(row.entity_id, entity);
    }
    const currency = reportRevenue.find(row => row.currency)?.currency || "USD";
    const pageMetricTotals = {};
    for (const row of metricRows) {
      if (row.entity_type !== "page" || !pageIds.has(row.entity_id)) continue;
      const value = metricNumber(row.value_json, row.metric);
      if (!value) continue;
      pageMetricTotals[row.metric] = row.metric === "page_follows" ? Math.max(pageMetricTotals[row.metric] || 0, value) : (pageMetricTotals[row.metric] || 0) + value;
    }
    const manualEarnings = reportRevenue.filter(row => (row.currency || currency) === currency).reduce((sum, row) => sum + number(row.gross_amount), 0);
    const latestSync = syncRuns[0] || null;
    const allSyncWarnings = latestSync && Array.isArray(latestSync.summary?.warnings) ? latestSync.summary.warnings : [];
    const latestSyncWarnings = restricted ? allSyncWarnings.filter(warning => (allowed || []).some(id => String(warning).includes(String(id)))) : allSyncWarnings;
    const allPageStatuses = latestSync?.summary?.page_statuses || [];
    const visiblePageStatuses = restricted ? allPageStatuses.filter(item => (allowed || []).includes(String(item.id))) : allPageStatuses;
    const latestPageStatuses = new Map(visiblePageStatuses.map(item => [String(item.id), item]));
    const latestPageSnapshots = new Map();
    for (const snapshot of (Array.isArray(pageSnapshots) ? pageSnapshots : [])) {
      const key = String(snapshot.page_id);
      if (!latestPageSnapshots.has(key)) latestPageSnapshots.set(key, snapshot);
    }
    const approximateMetric = metricRows.some(row => row.entity_type === "page" && row.metric === "monetization_approximate_earnings")
      ? "monetization_approximate_earnings"
      : (metricRows.some(row => row.entity_type === "page" && row.metric === "content_monetization_earnings") ? "content_monetization_earnings" : null);
    const payoutVisiblePageIds = new Set([...paymentByPage.keys()]);
    const approximateEarnings = approximateMetric
      ? metricRows.filter(row => row.entity_type === "page" && pageIds.has(row.entity_id) && row.metric === approximateMetric && (!restricted || payoutVisiblePageIds.has(row.entity_id)))
        .reduce((sum, row) => sum + metricNumber(row.value_json, row.metric), 0)
      : 0;
    const earnings = manualEarnings || approximateEarnings;
    const earningsSource = manualEarnings ? "manual" : (approximateMetric ? `meta_${approximateMetric}` : "none");
    const pageViewMetric = metricMap.find(metric => pageMetricTotals[metric] !== undefined)
      || Object.keys(pageMetricTotals).find(metric => /(^|_)(video_)?views?($|_)/i.test(metric)) || null;
    const pageReportsAll = filteredPages.map(page => {
      const pagePosts = scopedPosts.filter(post => post.page_id === page.id);
      const interactionBreakdown = pagePosts.reduce((acc, post) => {
        const stats = postStats(post);
        acc.comments += stats.comments; acc.shares += stats.shares; acc.reactions += stats.reactions; acc.total += stats.total;
        return acc;
      }, { comments: 0, shares: 0, reactions: 0, total: 0 });
      const interactions = interactionBreakdown.total;
      const pageMetricRows = metricRows.filter(row => row.entity_type === "page" && row.entity_id === page.id);
      const metricNames = [...new Set(pageMetricRows.map(row => row.metric))];
      const lastMetricAt = pageMetricRows.map(row => row.synced_at || row.end_time).filter(Boolean).sort().at(-1) || null;
      const snapshot = latestPageSnapshots.get(String(page.id)) || null;
      const snapshotWarnings = Array.isArray(snapshot?.metrics_json?.outcomes)
        ? snapshot.metrics_json.outcomes.filter(item => item.status === "error").map(item => `${item.metric}: ${(item.errors || []).at(-1) || "request thất bại"}`)
        : [];
      const pageWarnings = [...new Set([
        ...latestSyncWarnings.filter(warning => warning.includes(String(page.id)) || warning.toLowerCase().includes(String(page.name || "").toLowerCase())),
        ...snapshotWarnings
      ])];
      // These earnings metrics prove only that Meta returned a metric. They do not
      // expose the Professional Dashboard's content-monetization eligibility state.
      const monetizationMetricRows = pageMetricRows.filter(row => row.metric === "monetization_approximate_earnings" || row.metric === "content_monetization_earnings");
      const pageHasMonetizationMetric = monetizationMetricRows.length > 0;
      const pageApproximateEarnings = approximateMetric ? pageMetricRows.filter(row => row.metric === approximateMetric)
        .reduce((sum, row) => sum + metricNumber(row.value_json, row.metric), 0) : 0;
      const pageManualEarnings = reportRevenue.filter(row => row.page_id === page.id && (row.currency || currency) === currency)
        .reduce((sum, row) => sum + number(row.gross_amount), 0);
      const hasAnyPayoutLink = paymentLinks.some(link => String(link.page_id) === String(page.id));
      const payoutVisible = !restricted || !hasAnyPayoutLink || (paymentByPage.get(page.id) || []).length > 0;
      const pageEarnings = payoutVisible ? (pageManualEarnings || pageApproximateEarnings) : 0;
      const syncStatus = latestPageStatuses.get(String(page.id)) || null;
      const source = context.pageSources?.[String(page.id)];
      const accessScope = !restricted ? "platform" : (source?.direct && source?.inherited ? "direct_and_inherited" : source?.inherited ? "inherited" : "direct");
      return { ...page, asset_scope: page.custodian_business_id ? "bm" : "personal_or_outside_bm", posts: pagePosts.length, interactions, comments: interactionBreakdown.comments, shares: interactionBreakdown.shares, reactions: interactionBreakdown.reactions, interaction_breakdown: interactionBreakdown, payment_profiles: paymentByPage.get(page.id) || [], content_groups: groupsByPage.get(page.id) || [], metrics: perEntity.get(page.id) || {}, metric_names: metricNames,
        access_scope: accessScope, assigned_user_ids: source?.user_ids || [], inherited_from_team: accessScope === "inherited" || accessScope === "direct_and_inherited",
        metric_last_at: lastMetricAt, metric_rows: pageMetricRows.length,
        sync_warnings: pageWarnings,
        sync_status: syncStatus,
        latest_snapshot: snapshot ? { snapshot_date: snapshot.snapshot_date, window_start: snapshot.window_start, window_end: snapshot.window_end, status: snapshot.status, observed_at: snapshot.observed_at, posts_count: snapshot.posts_count } : null,
        earnings: pageEarnings,
        monetization_status: pageEarnings > 0 ? "earning" : (pageHasMonetizationMetric ? "metric_available_zero" : "status_unknown"),
        monetization_status_source: pageEarnings > 0 ? "graph_api_earnings_value" : (pageHasMonetizationMetric ? "graph_api_metric_presence_only" : "not_exposed_by_current_api") };
    });
    const monetizationGroups = {
      earning: pageReportsAll.filter(page => page.monetization_status === "earning").map(page => page.id),
      metric_available_zero: pageReportsAll.filter(page => page.monetization_status === "metric_available_zero").map(page => page.id),
      status_unknown: pageReportsAll.filter(page => page.monetization_status === "status_unknown").map(page => page.id)
    };
    const pageReports = pageReportsAll.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    const visiblePosts = scopedPosts.slice((postNumber - 1) * postSize, postNumber * postSize);
    const days = [];
    for (let cursor = range.start; cursor <= range.end; cursor = shift(cursor, 1)) days.push(cursor);
    const series = days.map(day => {
      const dayMetrics = metricRows.filter(row => String(row.end_time).slice(0, 10) === day && (!allowed || allowed.includes(row.entity_id)));
      const views = pageViewMetric ? dayMetrics.filter(row => row.entity_type === "page" && row.metric === pageViewMetric).reduce((sum, row) => sum + number(parse(row.value_json)), 0) : 0;
      const dayRevenue = reportRevenue.filter(row => String(row.period_end).slice(0, 10) === day && (row.currency || currency) === currency).reduce((sum, row) => sum + number(row.gross_amount), 0)
        || (approximateMetric ? dayMetrics.filter(row => row.entity_type === "page" && row.metric === approximateMetric)
          .reduce((sum, row) => sum + metricNumber(row.value_json, row.metric), 0) : 0);
      const dayPosts = scopedPosts.filter(row => String(row.created_time || '').slice(0, 10) === day).length;
      return { date: day, views, revenue: dayRevenue, posts: dayPosts };
    });
    const pageEngagements = pageMetricTotals.page_post_engagements || 0;
    const postInteractionBreakdown = scopedPosts.reduce((acc, post) => { const stats = postStats(post); acc.comments += stats.comments; acc.shares += stats.shares; acc.reactions += stats.reactions; acc.total += stats.total; return acc; }, { comments: 0, shares: 0, reactions: 0, total: 0 });
    return send(response, 200, { range, page_id: pageId, summary: { posts: scopedPosts.length, earnings, earnings_source: earningsSource, currency, views: pageViewMetric ? pageMetricTotals[pageViewMetric] || 0 : null, views_metric: pageViewMetric, engagements: pageEngagements, interactions: pageEngagements || postInteractionBreakdown.total, interaction_breakdown: postInteractionBreakdown, metrics: totals, monetization_groups: Object.fromEntries(Object.entries(monetizationGroups).map(([key, ids]) => [key, ids.length])) },
      sync: latestSync ? { ran_at: latestSync.ran_at, since_date: latestSync.since_date, until_date: latestSync.until_date, status: latestSync.status,
        pages: restricted ? visiblePageStatuses.length : (latestSync.summary?.pages || 0), metric_rows: restricted ? metricRows.filter(row => pageIds.has(String(row.entity_id))).length : (latestSync.summary?.metric_rows || 0),
        failed_requests: restricted ? visiblePageStatuses.filter(item => item.status === "warning").length : (latestSync.summary?.failed_requests || 0), empty_requests: restricted ? visiblePageStatuses.filter(item => item.status === "empty").length : (latestSync.summary?.empty_requests || 0),
        warnings: latestSyncWarnings } : null,
      pages: pageReports, monetization_groups: monetizationGroups, posts: visiblePosts.map(post => { const snapshot = latestPostSnapshots.get(String(post.id)); const syncState = postSyncState(post); return { ...post, page_name: pageNames.get(post.page_id) || post.page_id, interactions: postStats(post), discovery_synced_at: post.synced_at || null, interaction_synced_at: snapshot?.observed_at || null, sync_state: syncState.status, sync_error: syncState.error, synced_at: post.synced_at || null, interaction_snapshot: snapshot || null, metrics: perEntity.get(post.id) || {} }; }), revenue, series, pagination: { pages: { page: pageNumber, page_size: pageSize, total: pageReportsAll.length, pages: Math.ceil(pageReportsAll.length / pageSize) }, posts: { page: postNumber, page_size: postSize, total: scopedPosts.length, pages: Math.ceil(scopedPosts.length / postSize) } }, access: { role: context.profile.role, page_ids: allowed, visible_user_ids: context.visibleUserIds || [], managed_user_ids: context.managedUserIds || [], direct_page_ids: context.directPageIds || [], inherited_page_ids: context.inheritedPageIds || [] }});
  } catch (error) { response.setHeader("Cache-Control", "no-store, max-age=0"); return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message }); }
}
