import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";
import { getNotionForUser, readJobApplyInputs, markApplied, getDbId } from "@/lib/notion";
import { submitJobProposal } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

// Recover the exact question texts prepare wrote (numbered list) — strip the
// "N. " prefix it added. Lines that don't match (e.g. "None") are dropped.
function parseQuestions(questionsText: string): string[] {
  return questionsText
    .split("\n")
    .map((l) => l.match(/^\d+\.\s+(.*)$/)?.[1])
    .filter((q): q is string => !!q && q.trim().length > 0);
}

// Agent/user-facing: submit a proposal using the Bid / Cover Letter / Screening
// Answers the human (or agent) filled on the job's Notion row.
// POST { externalId, userId }  (Authorization: Bearer API_SECRET)
// Spends Connects and is irreversible — fails closed on any ambiguity, identity
// is required (never inferred), and the mutation is not retried.
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

  // Identity is required — this spends the user's Connects, so never infer it.
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required" });
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
  if (!settings.notion_token) {
    return res.status(400).json({ ok: false, error: "user has no Notion token" });
  }

  const notion = getNotionForUser(settings.notion_token);
  const dbId = settings.job_feed_db_id ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");

  const inputs = await readJobApplyInputs(notion, externalId, { dbId });
  if (!inputs) {
    return res.status(404).json({ ok: false, error: "job page not found in Notion" });
  }

  // Fail closed on anything ambiguous — a mispaired/blank submit spends Connects.
  if (inputs.bid === null || !Number.isFinite(inputs.bid) || inputs.bid <= 0) {
    return res.status(400).json({ ok: false, error: "set a positive Bid on the job row" });
  }
  if (!inputs.coverLetter.trim()) {
    return res.status(400).json({ ok: false, error: "fill the Cover Letter on the job row" });
  }

  // Pair answers to the questions prepare wrote — same source the human answered
  // against. One answer per line, in order; count must match exactly.
  const questions = parseQuestions(inputs.questionsText);
  let answers: { question: string; answer: string }[] | undefined;
  if (questions.length > 0) {
    const answerLines = inputs.answersText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (answerLines.length !== questions.length) {
      return res.status(400).json({
        ok: false,
        error: `Screening Answers must have one answer per line, in order (${questions.length} question(s), got ${answerLines.length})`,
      });
    }
    answers = questions.map((question, i) => ({ question, answer: answerLines[i] }));
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
      chargedAmount: inputs.bid,
      coverLetter: inputs.coverLetter,
      questions: answers,
    });
    proposalId = result.newProposalId;
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  // Proposal is submitted — the Notion update is best-effort (the next sync also
  // annotates Applied). Don't fail the request if the Notion write fails.
  const proposalUrl = `https://www.upwork.com/ab/proposals/${proposalId}`;
  let notionUpdated = false;
  try {
    notionUpdated = await markApplied(notion, externalId, proposalUrl, { dbId });
  } catch (e) {
    logger.warn({ err: e, externalId }, "proposal submitted but Notion markApplied failed");
  }

  return res.status(200).json({ ok: true, proposalId, proposalUrl, notionUpdated });
}
