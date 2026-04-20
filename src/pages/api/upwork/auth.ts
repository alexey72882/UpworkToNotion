import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";

const REDIRECT_URI = "https://upwork-to-notion.vercel.app/api/upwork/callback";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const { data: settings } = await getSupabase()
    .from("user_settings")
    .select("upwork_client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const client_id = settings?.upwork_client_id;
  if (!client_id) {
    return res.status(400).json({ ok: false, error: "Save your Upwork Client Key in settings first." });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${user.id}:${nonce}`;

  const url = new URL("https://www.upwork.com/ab/account-security/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);

  res.setHeader(
    "Set-Cookie",
    `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
  );
  return res.redirect(302, url.toString());
}
