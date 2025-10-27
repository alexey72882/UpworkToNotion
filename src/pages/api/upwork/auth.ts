import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const client_id = process.env.UPWORK_CLIENT_ID;
  const redirect_uri = process.env.UPWORK_REDIRECT_URI;

  if (!client_id || !redirect_uri) {
    return res.status(500).json({
      ok: false,
      error: "Missing UPWORK_CLIENT_ID / UPWORK_REDIRECT_URI",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const url = new URL("https://www.upwork.com/ab/account-security/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("state", state);

  console.log("[upwork/auth] redirecting to:", url.toString());
  return res.redirect(302, url.toString());
}
