import crypto from "node:crypto";
import { db, graph, graphPages } from "../_lib.mjs";

const redirectUri = () => process.env.META_OAUTH_REDIRECT_URI || "https://money.aiecom.vn/api/meta/callback";
const clean = value => String(value || "").replace(/[<>&]/g, "");
const html = (title, message) => `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui;max-width:680px;margin:10vh auto;padding:24px;background:#101411;color:#f4f8f6"><h1>${title}</h1><p>${message}</p><p><a style="color:#c9ff4a" href="/analytics.html">Mở báo cáo</a></p></body></html>`;

function verifyState(value) {
  const secret = process.env.META_OAUTH_STATE_SECRET;
  const [payload, signature] = String(value || "").split(".");
  if (!secret || !payload || !signature) throw new Error("Trạng thái OAuth không hợp lệ");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Trạng thái OAuth không hợp lệ");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!decoded.exp || Date.now() > decoded.exp) throw new Error("Phiên kết nối đã hết hạn; hãy thử lại");
}

async function token(params) {
  const url = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
  url.search = new URLSearchParams(params).toString();
  const result = await fetch(url);
  const body = await result.json();
  if (!result.ok || !body.access_token) throw new Error(body?.error?.message || "Không thể lấy token Meta");
  return body;
}

export default async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || "Bạn đã hủy cấp quyền Meta");
    verifyState(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Meta không trả về mã kết nối");
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) throw new Error("Thiếu cấu hình bảo mật Meta trên máy chủ");
    const short = await token({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri(), code });
    const long = await token({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token });
    const profile = await graph("me", long.access_token, { fields: "id,name" });
    const businesses = await graphPages("me/businesses", long.access_token, { fields: "id,name", limit: "100" }).catch(() => []);
    const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString() : null;
    await db("meta_connections?on_conflict=label", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ label: `meta-${profile.id}`, user_access_token: long.access_token, business_ids: businesses.map(item => item.id), page_ids: [], token_expires_at: expiresAt, updated_at: new Date().toISOString() }) });
    response.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    return response.send(html("Đã kết nối Meta", `Tài khoản ${clean(profile.name || "Meta")} đã được lưu phía máy chủ. Hãy mở báo cáo và chọn phạm vi đồng bộ để tải dữ liệu theo chu kỳ.`));
  } catch (error) {
    response.status(400).setHeader("Content-Type", "text/html; charset=utf-8");
    return response.send(html("Không thể kết nối Meta", clean(error.message || "Lỗi không xác định")));
  }
}
