import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { URLSearchParams } from "url";

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const { UPWORK_CLIENT_ID, UPWORK_REDIRECT_URI, UPWORK_SCOPES } = process.env;

  if (!UPWORK_CLIENT_ID || !UPWORK_REDIRECT_URI) {
    res.status(500).json({ ok: false, error: "Missing Upwork env vars" });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: UPWORK_CLIENT_ID,
    redirect_uri: UPWORK_REDIRECT_URI,
    scope: (UPWORK_SCOPES ?? "").replace(/\s+/g, " ").trim(),
    state,
  });

  const url = `https://www.upwork.com/ab/account-security/oauth2/authorize?${params.toString()}`;

  res.writeHead(302, { Location: url });
  res.end();
}
