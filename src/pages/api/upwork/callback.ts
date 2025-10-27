import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(
  new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connect: { timeout: 10_000 },
  }),
);

export const config = {
  runtime: "nodejs",
  regions: ["iad1"],
};

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

    const tokenResponse = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "notion-to-upwork/1.0 (+vercel)",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri,
      }),
    });

    const rawBody = await tokenResponse.text();
    let parsedBody: unknown = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // leave as text when JSON parsing fails
    }

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({
        ok: false,
        error: "token_exchange_failed",
        status: tokenResponse.status,
        body: parsedBody,
      });
    }

    const data = parsedBody as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    await saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
    });

    return res.status(200).json({ ok: true, saved: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const details =
      e && typeof e === "object" && !(e instanceof Error)
        ? JSON.stringify(e)
        : undefined;
    return res.status(500).json({
      ok: false,
      error: message,
      details,
    });
  }
}
