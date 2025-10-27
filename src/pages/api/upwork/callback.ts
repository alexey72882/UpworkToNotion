import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens, type TokenPayload } from "@/lib/upworkToken";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { code, error } = req.query as { code?: string; error?: string };

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
        code,
        redirect_uri,
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.status(502).json({ ok: false, error: data });
    }

    const tokens = data as Partial<TokenPayload>;
    if (
      !tokens.access_token ||
      !tokens.refresh_token ||
      typeof tokens.expires_in === "undefined"
    ) {
      return res
        .status(502)
        .json({ ok: false, error: "Invalid token payload from Upwork" });
    }

    const expiresIn = Number(tokens.expires_in);
    if (!Number.isFinite(expiresIn)) {
      return res.status(502).json({ ok: false, error: "Invalid expires_in from Upwork" });
    }

    await saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: expiresIn,
      scope: typeof tokens.scope === "string" ? tokens.scope : undefined,
    });

    return res.status(200).json({ ok: true, source: "callback", saved: true });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error";
    return res.status(500).json({ ok: false, error: message });
  }
}
