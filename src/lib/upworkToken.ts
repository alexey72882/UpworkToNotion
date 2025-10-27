import { supabase } from "./supabase";

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
const ROW_ID = "singleton";

export async function saveTokens(tokens: TokenPayload) {
  const expires_at = Date.now() + tokens.expires_in * 1000;

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        id: ROW_ID,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at,
        scope: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    throw error;
  }
}

export async function getTokens(): Promise<TokenRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", ROW_ID)
    .maybeSingle<TokenRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function refreshWithUpwork(refresh_token: string): Promise<TokenPayload> {
  const client_id = process.env.UPWORK_CLIENT_ID;
  const client_secret = process.env.UPWORK_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new Error("Missing UPWORK_CLIENT_ID or UPWORK_CLIENT_SECRET");
  }

  const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const response = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`refresh failed: ${JSON.stringify(json)}`);
  }

  return json as TokenPayload;
}

export async function getValidAccessToken(): Promise<string | null> {
  const row = await getTokens();
  if (!row) {
    return null;
  }

  const now = Date.now();
  if (row.expires_at - now < 120_000) {
    const refreshed = await refreshWithUpwork(row.refresh_token);
    await saveTokens(refreshed);
    return refreshed.access_token;
  }

  return row.access_token;
}
