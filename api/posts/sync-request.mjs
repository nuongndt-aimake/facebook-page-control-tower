import { randomUUID } from "node:crypto";
import { accessContext, db, readBody, send } from "../_lib.mjs";

const adminRoles = new Set(["platform_admin", "super_admin"]);
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;

export default async function handler(request, response) {
  try {
    const context = await accessContext(request);
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
      const visibleIds = new Set(visible.map(post => String(post.id)));
      const requests = visible.filter(post => visibleIds.has(String(post.id))).map(post => ({
        post_id: String(post.id), requested_by: context.user.id, window_start: windowStart, window_end: windowEnd,
        metric_names: requestedMetrics, status: "pending", idempotency_key: String(body.idempotency_key || randomUUID()) + `:${post.id}`
      }));
      await db("post_sync_requests?on_conflict=idempotency_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(requests) });
      return send(response, 202, { ok: true, requested: requests.length, post_ids: visible.map(post => post.id), window_start: windowStart, window_end: windowEnd });
    }
    if (request.method === "GET") {
      const url = new URL(request.url, `https://${request.headers.host}`);
      const postId = url.searchParams.get("post_id");
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
  } catch (error) {
    return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message });
  }
}
