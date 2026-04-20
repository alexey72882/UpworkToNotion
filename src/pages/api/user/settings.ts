import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";

export const config = { runtime: "nodejs" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const db = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await db
      .from("user_settings")
      .select("notion_token, job_feed_db_id, filters_db_id, diary_db_id, upwork_person_id, upwork_client_id, upwork_client_secret, last_sync_at, last_sync_result")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, settings: data ?? {} });
  }

  if (req.method === "PATCH") {
    const { notion_token, job_feed_db_id, filters_db_id, diary_db_id, upwork_person_id, upwork_client_id, upwork_client_secret } = req.body ?? {};
    const { error } = await db.from("user_settings").upsert(
      {
        user_id: user.id,
        ...(notion_token !== undefined && { notion_token }),
        ...(job_feed_db_id !== undefined && { job_feed_db_id }),
        ...(filters_db_id !== undefined && { filters_db_id }),
        ...(diary_db_id !== undefined && { diary_db_id }),
        ...(upwork_person_id !== undefined && { upwork_person_id }),
        ...(upwork_client_id !== undefined && { upwork_client_id }),
        ...(upwork_client_secret !== undefined && { upwork_client_secret }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
