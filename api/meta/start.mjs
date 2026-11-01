import crypto from "node:crypto";
import { requirePlatformAdmin, send } from "../_lib.mjs";

const redirectUri = () => process.env.META_OAUTH_REDIRECT_URI || "https://money.aiecom.vn/api/meta/callback";
const scopes = ["pages_show_list", "pages_read_engagement", "read_insights", "business_management"];

function state(userId) {
  const secret = process.env.META_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("META_OAUTH_STATE_SECRET chưa được cấu hình");
  const payload = Buffer.from(JSON.stringify({ nonce: crypto.randomBytes(18).toString("base64url"), userId, exp: Date.now() + 15 * 60_000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export default async function handler(request, response) {
  try {
    const context = await requirePlatformAdmin(request);
    if (!process.env.META_APP_ID) throw new Error("META_APP_ID chưa được cấu hình");
    const url = new URL("https://www.facebook.com/v26.0/dialog/oauth");
    const params = {
      client_id: process.env.META_APP_ID,
      redirect_uri: redirectUri(),
      state: state(context.user.id),
      response_type: "code"
    };
    if (process.env.META_LOGIN_CONFIG_ID) {
      params.config_id = process.env.META_LOGIN_CONFIG_ID;
    } else {
      params.scope = scopes.join(",");
    }
    url.search = new URLSearchParams(params).toString();
    return send(response, 200, { url: url.toString(), scopes });
  } catch (error) {
    return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message });
  }
}
