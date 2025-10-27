import { Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";
import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";

dns.setDefaultResultOrder("ipv4first");
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 10_000 },
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  }),
);

export const config = { runtime: "nodejs", regions: ["iad1"] };

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ExchangeResult =
  | { ok: true; status: number; json: any; endpoint: string }
  | {
      ok: false;
      status?: number;
      body?: string;
      error?: string;
      endpoint: string;
    };

async function exchangeWithRetry(params: {
  authB64: string;
  code: string;
  redirectUri: string;
  attempts?: number;
  backoffMs?: number;
}): Promise<ExchangeResult> {
  const { authB64, code, redirectUri } = params;
  const attempts = params.attempts ?? 3;
  const backoffMs = params.backoffMs ?? 400;

  const endpoints = [
    "https://www.upwork.com/api/v3/oauth2/token",
    "https://api.upwork.com/api/v3/oauth2/token",
  ];

  for (const endpoint of endpoints) {
    let lastError: unknown = null;

    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Basic ${authB64}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "notion-to-upwork/1.0 (+vercel)",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });

        const raw = await response.text();
        let parsed: any = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            body: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
            endpoint,
          };
        }

        return {
          ok: true,
          status: response.status,
          json: parsed,
          endpoint,
        };
      } catch (error) {
        lastError = error;
        await sleep(backoffMs * (i + 1));
      }
    }

    return {
      ok: false,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      endpoint,
    };
  }

  return { ok: false, error: "unreachable", endpoint: "n/a" };
}

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

    const authB64 = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    try {
      const probe = await fetch("https://api.upwork.com/api/v3/oauth2/token", {
        method: "HEAD",
      });
      console.log("✅ Upwork reachable:", probe.status);
    } catch (probeError) {
      console.warn("⚠️ Upwork preflight failed:", probeError);
    }

    const result = await exchangeWithRetry({
      authB64,
      code: String(code),
      redirectUri: redirect_uri,
    });

    if (!result.ok) {
      return res.status(result.status ?? 502).json({
        ok: false,
        error: "token_exchange_failed",
        status: result.status,
        endpoint: result.endpoint,
        body: result.body,
        details: result.error,
      });
    }

    const data = result.json as {
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

    return res.status(200).json({ ok: true, saved: true, endpoint: result.endpoint });
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
