import { Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";
import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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
    const { code, error, state } = req.query;

    if (error) {
      return res.status(400).json({ ok: false, error });
    }

    if (!code) {
      return res.status(400).json({ ok: false, error: "missing code" });
    }

    const cookieState = req.cookies?.oauth_state;
    if (!state || !cookieState || state !== cookieState) {
      return res.status(403).json({ ok: false, error: "invalid_state" });
    }
    res.setHeader(
      "Set-Cookie",
      "oauth_state=; HttpOnly; Path=/; Max-Age=0",
    );

    // Extract userId from state (format: "userId:nonce")
    const userId = cookieState.split(":")[0];

    const { data: settings } = await getSupabase()
      .from("user_settings")
      .select("upwork_client_id, upwork_client_secret")
      .eq("user_id", userId)
      .maybeSingle();

    const client_id = settings?.upwork_client_id;
    const client_secret = settings?.upwork_client_secret;
    const redirect_uri = "https://upwork-to-notion.vercel.app/api/upwork/callback";

    if (!client_id || !client_secret) {
      return res.status(400).json({ ok: false, error: "Upwork credentials not found. Save your Key and Secret in settings first." });
    }

    const authB64 = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    try {
      const probe = await fetch("https://api.upwork.com/api/v3/oauth2/token", {
        method: "HEAD",
      });
      logger.info({ status: probe.status }, "Upwork reachable");
    } catch (probeError) {
      logger.warn({ err: probeError }, "Upwork preflight failed");
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

    try {
      await saveTokens(
        {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          scope: data.scope,
        },
        userId || undefined,
      );

      // Auto-fetch the user's Upwork person ID and save it to user_settings
      try {
        const meRes = await fetch("https://api.upwork.com/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "{ user { id } }" }),
        });
        const me = await meRes.json();
        const personId = String(me?.data?.user?.id ?? "");
        if (personId && userId) {
          const db = getSupabase();
          const { data: existing } = await db.from("user_settings").select("user_id").eq("user_id", userId).maybeSingle();
          if (existing) {
            await db.from("user_settings").update({ upwork_person_id: personId, updated_at: new Date().toISOString() }).eq("user_id", userId);
          } else {
            await db.from("user_settings").insert({ user_id: userId, upwork_person_id: personId, updated_at: new Date().toISOString() });
          }
        }
      } catch (meError) {
        logger.warn({ err: meError }, "Could not fetch Upwork person ID");
      }

      return res.status(200).json({ ok: true, saved: true, endpoint: result.endpoint });
    } catch (saveError) {
      const supabaseMessage =
        saveError instanceof Error
          ? saveError.message
          : typeof saveError === "string"
          ? saveError
          : JSON.stringify(saveError);
      return res.status(200).json({
        ok: true,
        saved: false,
        endpoint: result.endpoint,
        supabase_error: supabaseMessage,
      });
    }
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
