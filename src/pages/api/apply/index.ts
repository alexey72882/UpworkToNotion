import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";
import { getNotionForUser, markApplied, getDbId } from "@/lib/notion";
import { submitJobProposal } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

// Agent-facing: submit a proposal to Upwork, then mark the job Applied in Notion.
// POST { externalId, chargedAmount, coverLetter, answers?, userId }  (Authorization: Bearer API_SECRET)
// Spends Connects and is irreversible — identity is required (never inferred),
// and the mutation is not retried.
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
  const jobReference = m[1];

  const chargedAmount = Number(req.body?.chargedAmount);
  if (!Number.isFinite(chargedAmount) || chargedAmount <= 0) {
    return res.status(400).json({ ok: false, error: "chargedAmount must be a positive number" });
  }

  const coverLetter = String(req.body?.coverLetter ?? "");
  if (!coverLetter.trim()) {
    return res.status(400).json({ ok: false, error: "coverLetter is required" });
  }

  // Identity is required — this spends the user's Connects, so never infer it.
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required" });
  }

  let answers: { question: string; answer: string }[] | undefined;
  if (req.body?.answers !== undefined) {
    if (!Array.isArray(req.body.answers) ||
        !req.body.answers.every((a: unknown) => a && typeof (a as any).question === "string" && typeof (a as any).answer === "string")) {
      return res.status(400).json({ ok: false, error: "answers must be an array of { question, answer }" });
    }
    answers = req.body.answers.map((a: any) => ({ question: String(a.question), answer: String(a.answer) }));
  }

  const db = getSupabase();
  const { data: settings } = await db
    .from("user_settings")
    .select("notion_token, job_feed_db_id, upwork_person_id, upwork_nid, upwork_org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings) {
    return res.status(400).json({ ok: false, error: "unknown user" });
  }
  if (!settings.upwork_person_id || !settings.upwork_nid || !settings.upwork_org_id) {
    return res.status(400).json({ ok: false, error: "missing Upwork ids — reconnect Upwork to populate them" });
  }

  const token = await getValidAccessToken(userId);
  if (!token) {
    return res.status(401).json({ ok: false, error: "no Upwork token" });
  }

  let proposalId: string;
  try {
    const result = await submitJobProposal(token, {
      personId: settings.upwork_person_id,
      nid: settings.upwork_nid,
      orgId: settings.upwork_org_id,
      jobReference,
      chargedAmount,
      coverLetter,
      questions: answers,
    });
    proposalId = result.newProposalId;
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  // Proposal is submitted — the Notion update is best-effort (the next sync also
  // annotates Applied). Don't fail the request if Notion write fails.
  const proposalUrl = `https://www.upwork.com/ab/proposals/${proposalId}`;
  let notionUpdated = false;
  if (settings.notion_token) {
    try {
      const notion = getNotionForUser(settings.notion_token);
      const dbId = settings.job_feed_db_id ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
      notionUpdated = await markApplied(notion, externalId, proposalUrl, { dbId });
    } catch (e) {
      logger.warn({ err: e, externalId }, "proposal submitted but Notion markApplied failed");
    }
  }

  return res.status(200).json({ ok: true, proposalId, proposalUrl, notionUpdated });
}
