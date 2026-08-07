import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";
import { runPrepare, type ApplyErrorCode } from "@/lib/apply";

export const config = { runtime: "nodejs" };

const STATUS: Record<ApplyErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  unauthorized: 401,
  upstream: 502,
};

// Agent-facing: enrich a Job Feed page with the job's screening questions so the
// human can answer them in Notion before submitting. Read-only against Upwork.
// POST { externalId: "job-<numeric>", userId? }  (Authorization: Bearer API_SECRET)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "use POST" });
  }

  // Resolve user. Read-only + low-stakes, so single-user fallback is fine here
  // (unlike submit, where identity must be deliberate — wrong user spends Connects).
  let userId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
  if (!userId) {
    const { data } = await getSupabase().from("upwork_tokens").select("user_id").limit(1).maybeSingle();
    userId = data?.user_id ?? undefined;
  }
  if (!userId) {
    return res.status(400).json({ ok: false, error: "no user" });
  }

  const result = await runPrepare(userId, String(req.body?.externalId ?? ""));
  if (!result.ok) {
    return res.status(STATUS[result.code]).json({ ok: false, error: result.error });
  }
  return res.status(200).json(result);
}
