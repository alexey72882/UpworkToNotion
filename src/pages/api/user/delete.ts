import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";
import { deleteVercelDomain } from "@/lib/vercelDomains";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const db = getSupabase();

  // Remove this user's pool callback domain from Vercel so it can never be reused.
  // Best-effort — a Vercel failure must not block the account deletion. The
  // callback_domains row itself is removed by the ON DELETE CASCADE when the user
  // is deleted below.
  const { data: dom } = await db
    .from("callback_domains")
    .select("redirect_uri")
    .eq("user_id", user.id)
    .maybeSingle();
  if (dom?.redirect_uri) {
    const ok = await deleteVercelDomain(dom.redirect_uri);
    if (!ok) logger.warn({ userId: user.id, redirect_uri: dom.redirect_uri }, "could not delete Vercel callback domain on account deletion");
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
