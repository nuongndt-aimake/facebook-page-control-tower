import { accessContext, send } from "../_lib.mjs";
export default async function handler(request, response) {
  try { return send(response, 200, await accessContext(request)); }
  catch (error) { return send(response, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
