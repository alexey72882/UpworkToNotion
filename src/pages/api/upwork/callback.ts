export const config = {
  runtime: "nodejs",
};

import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).json({ ok: false, error });
    }

    if (!code) {
      return res.status(400).json({ ok: false, error: "missing code" });
    }

    const client_id = process.env.UPWORK_CLIENT_ID;
    const client_secret = process.env.UPWORK_CLIENT_SECRET;
    const redirect_uri = process.env.UPWORK_REDIRECT_URI;

    if (!client_id || !client_secret || !redirect_uri) {
      return res.status(500).json({ ok: false, error: "Missing UPWORK_* envs" });
    }

    const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri,
      }),
    });

    const data = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      return res
        .status(502)
        .json({ ok: false, error: "token_exchange_failed", details: data });
    }

    await saveTokens({
      access_token: (data as any).access_token,
      refresh_token: (data as any).refresh_token,
      expires_in: (data as any).expires_in,
      scope: (data as any).scope,
    });

    return res.status(200).json({ ok: true, source: "callback", saved: true });
  } catch (e: unknown) {
    const errorDetails =
      typeof e === "object" ? JSON.stringify(e, null, 2) : String(e);
    return res.status(500).json({ ok: false, error: errorDetails });
  }
}
