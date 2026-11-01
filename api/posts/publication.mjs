import { randomUUID } from "node:crypto";
import { accessContext, db, readBody, send } from "../_lib.mjs";

const adminRoles = new Set(["platform_admin", "super_admin"]);

export default async function handler(request, response) {
  try {
    const context = await accessContext(request);
    if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
    const body = await readBody(request);
    const postId = String(body.post_id || "").trim();
    const pageId = body.page_id ? String(body.page_id).trim() : null;
    const destinationType = body.destination_type === "community" ? "community" : "page";
    if (!postId) return send(response, 400, { error: "post_id là bắt buộc" });
    const postRows = await db(`posts?select=id,page_id&id=eq.${encodeURIComponent(postId)}&limit=1`);
    if (!postRows[0]) return send(response, 404, { error: "Không tìm thấy bài viết; hãy đồng bộ nội dung trước" });
    const effectivePageId = pageId || postRows[0].page_id;
    if (!new Set(["platform_admin", "super_admin"].includes(context.profile.role) ? [effectivePageId] : context.pageIds).has(String(effectivePageId))) throw new Error("Forbidden");
    const publicationKey = String(body.publication_key || randomUUID());
    await db("post_publications?on_conflict=publication_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({
      post_id: postId, page_id: effectivePageId, destination_type: destinationType,
      community_id: body.community_id || null, community_name: body.community_name || null, community_url: body.community_url || null,
      published_at: body.published_at || null, external_url: body.external_url || null,
      discovered_source: body.discovered_source === "meta" ? "meta" : (body.discovered_source === "manual" ? "manual" : "extension"),
      discovered_by: context.user.id, verification_status: "pending", metadata: body.metadata || {}, publication_key: publicationKey, updated_at: new Date().toISOString()
    }) });
    return send(response, 202, { ok: true, publication_key: publicationKey, post_id: postId, page_id: effectivePageId, destination_type: destinationType });
  } catch (error) {
    return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message });
  }
}
