import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { assignCallback } from "@/lib/callbackPool";

export const config = { runtime: "nodejs" };

// Session-authed: claim (or return the already-assigned) per-user callback URL for
// the current user, so they can register it as the redirect URI in their Upwork app.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const redirectUri = await assignCallback(user.id);
  if (!redirectUri) {
    return res.status(409).json({ ok: false, error: "No callback available — contact support." });
  }
  return res.status(200).json({ ok: true, redirectUri });
}
