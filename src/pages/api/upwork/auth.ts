import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_REDIRECT_URI } from "@/lib/upworkOAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const db = getSupabase();
  const { data: settings } = await db
    .from("user_settings")
    .select("upwork_client_id, upwork_redirect_uri")
    .eq("user_id", user.id)
    .maybeSingle();

  const client_id = settings?.upwork_client_id;
  if (!client_id) {
    return res.status(400).json({ ok: false, error: "Save your Upwork Client Key in settings first." });
  }

  // Per-user callback. Assigned separately via /api/user/callback-url (the "Get my
  // callback URL" button) — never auto-assigned here, so an existing connected user
  // keeps their registered callback. Falls back to the shared env callback.
  const redirect_uri = settings?.upwork_redirect_uri ?? DEFAULT_REDIRECT_URI;

  // Server-side state (replaces the cookie so the callback works cross-domain).
  const nonce = crypto.randomBytes(16).toString("hex");
  await db
    .from("user_settings")
    .update({ upwork_oauth_nonce: nonce, upwork_oauth_nonce_at: new Date().toISOString() })
    .eq("user_id", user.id);

  const state = `${user.id}:${nonce}`;
  const url = new URL("https://www.upwork.com/ab/account-security/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("state", state);

  return res.redirect(302, url.toString());
}
