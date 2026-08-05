import type { NextApiRequest, NextApiResponse } from "next";
import { fetchJobFeed } from "@/lib/upwork";
import { webFilterToJobFilters } from "@/lib/webFilter";
import { getValidAccessToken } from "@/lib/upworkToken";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";

export const config = { runtime: "nodejs" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;

  const { data } = await getSupabase()
    .from("upwork_tokens")
    .select("user_id")
    .limit(1)
    .maybeSingle();

  const userId = data?.user_id;
  const token = await getValidAccessToken(userId);
  if (!token) return res.status(401).json({ ok: false, error: "no_token" });

  const { data: settings } = await getSupabase()
    .from("user_settings")
    .select("web_filter")
    .eq("user_id", userId)
    .maybeSingle();

  const filters = webFilterToJobFilters(settings?.web_filter as never);
  const jobs = await fetchJobFeed(filters, token);

  return res.status(200).json({
    ok: true,
    count: jobs.length,
    jobs: jobs.map(j => ({ title: j.title, externalId: j.externalId, url: j.url })),
  });
}
