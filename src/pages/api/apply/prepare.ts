import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";
import { getNotionForUser, setJobScreeningQuestions, getDbId } from "@/lib/notion";
import { fetchJobScreening } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";

export const config = { runtime: "nodejs" };

// Agent-facing: enrich a Job Feed page with the job's screening questions so the
// human can answer them in Notion before submitting. Read-only against Upwork.
// POST { externalId: "job-<numeric>", userId?: string }  (Authorization: Bearer API_SECRET)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "use POST" });
  }

  const externalId = String(req.body?.externalId ?? "");
  const m = externalId.match(/^job-(\d+)$/);
  if (!m) {
    return res.status(400).json({ ok: false, error: "externalId must be 'job-<numeric>'" });
  }
  const numericId = m[1];

  // Resolve user. Read-only + low-stakes, so single-user fallback is fine here
  // (unlike submit, where identity must be deliberate — wrong user spends Connects).
  const db = getSupabase();
  let userId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
  if (!userId) {
    const { data } = await db.from("upwork_tokens").select("user_id").limit(1).maybeSingle();
    userId = data?.user_id ?? undefined;
  }
  if (!userId) {
    return res.status(400).json({ ok: false, error: "no user" });
  }

  const { data: settings } = await db
    .from("user_settings")
    .select("notion_token, job_feed_db_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.notion_token) {
    return res.status(400).json({ ok: false, error: "user has no Notion token" });
  }

  const token = await getValidAccessToken(userId);
  if (!token) {
    return res.status(401).json({ ok: false, error: "no Upwork token" });
  }

  let screening;
  try {
    screening = await fetchJobScreening(numericId, token);
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  const questionsText = screening.questions.length
    ? screening.questions.map((q) => `${q.sequenceNumber + 1}. ${q.question}`).join("\n")
    : "None";

  const notion = getNotionForUser(settings.notion_token);
  const dbId = settings.job_feed_db_id ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  let found: boolean;
  try {
    found = await setJobScreeningQuestions(notion, externalId, questionsText, { dbId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Screening Questions|property/i.test(msg)) {
      return res.status(400).json({
        ok: false,
        error: "Add a 'Screening Questions' rich-text property to the Job Feed DB first",
      });
    }
    return res.status(502).json({ ok: false, error: msg });
  }
  if (!found) {
    return res.status(404).json({ ok: false, error: "job page not found in Notion" });
  }

  return res.status(200).json({
    ok: true,
    externalId,
    coverLetterRequired: screening.coverLetterRequired,
    questions: screening.questions,
  });
}
