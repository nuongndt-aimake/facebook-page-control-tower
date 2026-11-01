import { db, send, requireAdmin } from "./_lib.mjs";
export default async function handler(request, response) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    const [pages, posts, runs] = await Promise.all([
      db("pages?select=id,name,category,meta_connection,custodian_business_id,updated_at&order=name.asc"),
      db(`posts?select=id,page_id,created_time,message,permalink_url,media_type,synced_at&order=created_time.desc&limit=${limit}`),
      db("sync_runs?select=ran_at,status,summary&order=ran_at.desc&limit=1")
    ]);
    return send(response, 200, { pages, posts, latest_sync: runs[0] || null });
  } catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
