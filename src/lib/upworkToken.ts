import { getSupabase } from "@/lib/supabase";

export type TokenPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

type TokenRow = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string | null;
};

const TABLE = "upwork_tokens";

export async function saveTokens(tokens: TokenPayload, userId?: string) {
  const expires_at = Date.now() + tokens.expires_in * 1000;

  if (userId) {
    const { error } = await getSupabase()
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at,
          scope: tokens.scope ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
  } else {
    // Legacy singleton path
    const { error } = await getSupabase()
      .from(TABLE)
      .upsert(
        {
          id: "singleton",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at,
          scope: tokens.scope ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (error) throw error;
  }
}

async function getTokenRow(userId?: string): Promise<TokenRow | null> {
  const supabase = getSupabase();
  if (userId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("access_token, refresh_token, expires_at, scope")
      .eq("user_id", userId)
      .maybeSingle<TokenRow>();
    if (error) throw error;
    return data;
  }
  // Legacy singleton path
  const { data, error } = await supabase
    .from(TABLE)
    .select("access_token, refresh_token, expires_at, scope")
    .eq("id", "singleton")
    .maybeSingle<TokenRow>();
  if (error) throw error;
  return data;
}

async function getUserCredentials(userId: string): Promise<{ client_id: string; client_secret: string } | null> {
  const { data } = await getSupabase()
    .from("user_settings")
    .select("upwork_client_id, upwork_client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.upwork_client_id || !data?.upwork_client_secret) return null;
  return { client_id: data.upwork_client_id, client_secret: data.upwork_client_secret };
}

async function refreshWithUpwork(refresh_token: string, credentials: { client_id: string; client_secret: string }): Promise<TokenPayload> {
  const auth = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString("base64");

  const response = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`refresh failed: ${JSON.stringify(json)}`);
  }

  return json as TokenPayload;
}

export async function getValidAccessToken(userId?: string): Promise<string | null> {
  const row = await getTokenRow(userId);
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at - now < 120_000) {
    // For legacy singleton, fall back to env vars
    const credentials = userId
      ? await getUserCredentials(userId)
      : { client_id: process.env.UPWORK_CLIENT_ID ?? "", client_secret: process.env.UPWORK_CLIENT_SECRET ?? "" };

    if (!credentials?.client_id || !credentials?.client_secret) {
      throw new Error("Upwork credentials not configured");
    }

    const refreshed = await refreshWithUpwork(row.refresh_token, credentials);
    await saveTokens(refreshed, userId);
    return refreshed.access_token;
  }

  return row.access_token;
}

// Legacy exports kept for backward compat
export async function getTokens() {
  return getTokenRow();
}
