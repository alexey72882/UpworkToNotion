import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { getSupabase } from "@/lib/supabase";
import { getNotionForUser, readJobApplyInputs, markApplied, getDbId } from "@/lib/notion";
import { submitJobProposal } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

// Parse a numbered list ("1. ...", "2. ...") inside one cell. An item runs from
// its marker until the next marker, so an entry can span multiple lines (e.g. a
// multi-paragraph screening answer). Text before the first marker (e.g. "None")
// is ignored. Used for both the questions prepare wrote and the human's answers.
function parseNumberedList(text: string): string[] {
  const items: string[] = [];
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*\d+\.\s?(.*)$/);
    if (m) {
      if (current !== null) items.push(current.trim());
      current = m[1];
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) items.push(current.trim());
  return items.filter((s) => s.length > 0);
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
  // against. Both are numbered lists ("1. ...", "2. ...") in one cell; count must
  // match exactly.
  const questions = parseNumberedList(inputs.questionsText);
  let answers: { question: string; answer: string }[] | undefined;
  if (questions.length > 0) {
    const answerItems = parseNumberedList(inputs.answersText);
    if (answerItems.length !== questions.length) {
      return res.status(400).json({
        ok: false,
        error: `Screening Answers must be a numbered list matching the questions (${questions.length} question(s), got ${answerItems.length})`,
      });
    }
    answers = questions.map((question, i) => ({ question, answer: answerItems[i] }));
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
