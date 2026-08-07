import { Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";
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

export const DEFAULT_REDIRECT_URI =
  process.env.UPWORK_REDIRECT_URI ?? "https://upwork-to-notion.vercel.app/api/upwork/callback";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 min — parity with the old cookie Max-Age=600

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ExchangeResult =
  | { ok: true; json: any }
  | { ok: false; status?: number; body?: string; error?: string };

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
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        if (!response.ok) {
          return { ok: false, status: response.status, body: typeof parsed === "string" ? parsed : JSON.stringify(parsed) };
        }
        return { ok: true, json: parsed };
      } catch (error) {
        lastError = error;
        await sleep(backoffMs * (i + 1));
      }
    }
    return { ok: false, error: lastError instanceof Error ? lastError.message : String(lastError) };
  }
  return { ok: false, error: "unreachable" };
}

export type OAuthErrorCode = "invalid_state" | "no_credentials" | "token_exchange_failed" | "error";
export type OAuthResult = { ok: true } | { ok: false; code: OAuthErrorCode; error: string; status?: number };

// Shared OAuth-completion core, used by both the direct freelancelog callback and
// the neutral authvault.app callback. Validates the server-side nonce (single-use
// + expiry — replaces the cookie so the callback works cross-domain), exchanges the
// code using the user's per-user redirect_uri, saves tokens, captures nid/org/person.
export async function completeUpworkOAuth(userId: string, nonce: string, code: string): Promise<OAuthResult> {
  if (!userId || !nonce) return { ok: false, code: "invalid_state", error: "invalid_state" };
  const db = getSupabase();

  const { data: settings } = await db
    .from("user_settings")
    .select("upwork_client_id, upwork_client_secret, upwork_redirect_uri, upwork_oauth_nonce, upwork_oauth_nonce_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Server-side state check: nonce must match and be fresh.
  if (!settings?.upwork_oauth_nonce || settings.upwork_oauth_nonce !== nonce) {
    return { ok: false, code: "invalid_state", error: "invalid_state" };
  }
  const nonceAt = settings.upwork_oauth_nonce_at ? new Date(settings.upwork_oauth_nonce_at).getTime() : 0;
  if (!nonceAt || Date.now() - nonceAt > NONCE_TTL_MS) {
    await db.from("user_settings").update({ upwork_oauth_nonce: null, upwork_oauth_nonce_at: null }).eq("user_id", userId);
    return { ok: false, code: "invalid_state", error: "state_expired" };
  }
  // Single-use: clear immediately so it can't be replayed.
  await db.from("user_settings").update({ upwork_oauth_nonce: null, upwork_oauth_nonce_at: null }).eq("user_id", userId);

  const client_id = settings.upwork_client_id;
  const client_secret = settings.upwork_client_secret;
  if (!client_id || !client_secret) {
    return { ok: false, code: "no_credentials", error: "Upwork credentials not found." };
  }
  const redirect_uri = settings.upwork_redirect_uri ?? DEFAULT_REDIRECT_URI;
  const authB64 = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const result = await exchangeWithRetry({ authB64, code, redirectUri: redirect_uri });
  if (!result.ok) {
    return { ok: false, code: "token_exchange_failed", error: result.body ?? result.error ?? "token_exchange_failed", status: result.status };
  }

  const data = result.json as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
  await saveTokens(
    { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, scope: data.scope },
    userId,
  );

  // Capture nid / org / person id (best-effort — feeds proposal submission).
  try {
    const meRes = await fetch("https://api.upwork.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ user { id name nid } organization { id } }" }),
    });
    const me = await meRes.json();
    const personId = String(me?.data?.user?.id ?? "");
    const upworkName = String(me?.data?.user?.name ?? "").split(/\s+/)[0];
    const upworkNid = String(me?.data?.user?.nid ?? "");
    const upworkOrgId = String(me?.data?.organization?.id ?? "");
    if (personId) {
      await db.from("user_settings").update({
        upwork_person_id: personId,
        ...(upworkName && { upwork_name: upworkName }),
        ...(upworkNid && { upwork_nid: upworkNid }),
        ...(upworkOrgId && { upwork_org_id: upworkOrgId }),
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
    }
  } catch (meError) {
    logger.warn({ err: meError }, "Could not fetch Upwork person ID");
  }

  return { ok: true };
}
