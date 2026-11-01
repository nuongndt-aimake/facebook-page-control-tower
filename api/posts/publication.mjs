import { randomUUID } from "node:crypto";
import { accessContext, assertMutableContext, db, readBody, send } from "../_lib.mjs";

const adminRoles = new Set(["platform_admin", "super_admin"]);

export default async function handler(request, response) {
  try {
    const context = await accessContext(request);
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
    if (effectivePageId && !new Set(["platform_admin", "super_admin"].includes(context.profile.role) ? [effectivePageId] : context.pageIds).has(String(effectivePageId))) throw new Error("Forbidden");
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
  } catch (error) {
    return send(response, error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500, { error: error.message });
  }
}
