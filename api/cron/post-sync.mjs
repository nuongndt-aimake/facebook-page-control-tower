import { connections, db, graph, requireAdmin, redactSecrets, resolveConnectionPages, send } from "../_lib.mjs";
import { saveInsights } from "./sync.mjs";

const enabled = () => String(process.env.ENABLE_POST_SYNC_WORKER || "false").toLowerCase() === "true";
const limitValue = value => Math.min(Math.max(Number.parseInt(value || process.env.POST_SYNC_BATCH || "1", 10) || 1, 1), 100);
const workerId = () => process.env.VERCEL_REGION ? `vercel:${process.env.VERCEL_REGION}:post-sync` : `local:${process.pid}:post-sync`;
const errorText = error => error?.message || String(error);
const metricNames = request => Array.isArray(request.metric_names) ? request.metric_names.map(value => String(value).trim()).filter(Boolean) : [];

async function findPageToken(pageId) {
  for (const connection of await connections()) {
    try {
      const resolved = await resolveConnectionPages(connection, { pageIds: [pageId] });
      const page = resolved.pages?.find(item => String(item.id) === String(pageId));
      if (page?.access_token) return page.access_token;
    } catch { /* try the next configured Meta connection */ }
  }
  return null;
}

async function attemptRow(request, status, details = {}) {
  await db("post_sync_attempts?on_conflict=request_id,attempt_no", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ request_id: request.id, attempt_no: Number(request.attempt_count || 1), status,
      error_message: details.error_message || null, rows_written: Number(details.rows_written || 0), metadata: redactSecrets(details.metadata || {}),
      started_at: details.started_at || new Date().toISOString(), completed_at: new Date().toISOString() })
  });
}

async function finish(request, status, error = {}) {
  const retryable = ["failed", "permission_error"].includes(status) && Number(request.attempt_count || 0) < 3;
  const finalStatus = retryable ? "pending" : status;
  await db(`post_sync_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: finalStatus,
      available_at: retryable ? new Date(Date.now() + Number(request.attempt_count || 1) * 60000).toISOString() : new Date().toISOString(),
      completed_at: retryable ? null : new Date().toISOString(), last_error: redactSecrets(error), updated_at: new Date().toISOString() })
  });
  return finalStatus;
}

async function processRequest(request) {
  const startedAt = new Date().toISOString();
  const posts = await db(`posts?select=id,page_id&id=eq.${encodeURIComponent(request.post_id)}&limit=1`);
  if (!posts[0]) throw new Error("Không tìm thấy bài viết");
  const token = await findPageToken(posts[0].page_id);
  if (!token) {
    await attemptRow(request, "permission_error", { started_at: startedAt, error_message: "Không lấy được Page token", metadata: { post_id: request.post_id } });
    return { status: await finish(request, "permission_error", { code: "page_token_unavailable" }) };
  }
  const raw = await graph(request.post_id, token, { fields: "id,comments.limit(0).summary(true),shares" });
  let reactionError = null;
  try {
    const reactionResult = await graph(request.post_id, token, { fields: "id,reactions.limit(0).summary(true)" });
    raw.reactions = reactionResult.reactions;
  } catch (error) { reactionError = errorText(error); }
  const comments = raw.comments?.summary?.total_count;
  const reactions = raw.reactions?.summary?.total_count;
  const shares = raw.shares?.count;
  const names = metricNames(request);
  const metricResult = names.length ? await saveInsights("post", request.post_id, token, names, "day", request.window_start, request.window_end, new Date().toISOString()) : { rows: 0, warnings: [], outcomes: [] };
  const status = metricResult.outcomes.some(item => item.status === "error") ? "failed" : (comments === undefined && reactions === undefined && shares === undefined && !metricResult.rows ? "empty" : "succeeded");
  await db("post_metric_snapshots", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    post_id: request.post_id, request_id: request.id, observed_at: new Date().toISOString(), window_start: request.window_start, window_end: request.window_end,
    status, comments_count: comments ?? null, reactions_count: reactions ?? null, shares_count: shares ?? null,
    metrics_json: { outcomes: metricResult.outcomes, warnings: metricResult.warnings, reaction_error: reactionError }, raw_json: raw
  }) });
  await attemptRow(request, status, { started_at: startedAt, rows_written: metricResult.rows ? metricResult.rows + 1 : 1, metadata: { post_id: request.post_id, metric_names: names } });
  return { status: await finish(request, status, status === "failed" ? { warnings: metricResult.warnings } : {}) };
}

export async function runPostSync({ limit = limitValue() } = {}) {
  const requests = await db("rpc/claim_post_sync_requests", { method: "POST", body: JSON.stringify({ p_worker: workerId(), p_limit: limit }) });
  const results = [];
  for (const request of Array.isArray(requests) ? requests : []) {
    try { results.push({ request_id: request.id, post_id: request.post_id, ...(await processRequest(request)) }); }
    catch (error) {
      await attemptRow(request, "failed", { error_message: errorText(error), metadata: { post_id: request.post_id } }).catch(() => {});
      results.push({ request_id: request.id, post_id: request.post_id, status: await finish(request, "failed", { message: errorText(error) }).catch(() => "failed"), error: errorText(error) });
    }
  }
  return { claimed: Array.isArray(requests) ? requests.length : 0, completed: results.filter(item => ["succeeded", "empty"].includes(item.status)).length, failed: results.filter(item => ["failed", "permission_error"].includes(item.status)).length, results };
}

export default async function handler(request, response) {
  try {
    requireAdmin(request, true);
    if (!enabled()) return send(response, 409, { error: "Post sync worker đang tắt", code: "POST_SYNC_WORKER_DISABLED" });
    const url = new URL(request.url, `https://${request.headers.host}`);
    return send(response, 200, await runPostSync({ limit: limitValue(url.searchParams.get("limit")) }));
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
