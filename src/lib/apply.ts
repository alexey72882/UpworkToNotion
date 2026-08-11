import { getSupabase } from "@/lib/supabase";
import { getNotionForUser, readJobApplyInputs, markApplied, getDbId } from "@/lib/notion";
import { submitJobProposal } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";

// Shared apply logic used by both the HTTP route and the MCP tool. Returns a
// typed result so each caller maps `code` to its own transport (HTTP status /
// MCP tool error) without losing the fail-closed granularity.
export type ApplyErrorCode = "bad_request" | "not_found" | "unauthorized" | "upstream";
export type ApplyError = { ok: false; code: ApplyErrorCode; error: string };

export type SubmitResult =
  | { ok: true; proposalId: string; proposalUrl: string; notionUpdated: boolean }
  | ApplyError;

const err = (code: ApplyErrorCode, error: string): ApplyError => ({ ok: false, code, error });

function parseExternalId(externalId: string): string | null {
  return externalId.match(/^job-(\d+)$/)?.[1] ?? null;
}

// Parse a numbered list ("1. ...", "2. ...") inside one cell. An item runs from
// its marker until the next marker, so an entry can span multiple lines.
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

// Submit a proposal using the Bid / Cover Letter / Screening Answers the human or
// agent filled on the job row. Spends Connects; fails closed on any ambiguity.
export async function runSubmit(userId: string, externalId: string): Promise<SubmitResult> {
  const jobReference = parseExternalId(externalId);
  if (!jobReference) return err("bad_request", "externalId must be 'job-<numeric>'");

  const { data: settings } = await getSupabase()
    .from("user_settings")
    .select("notion_token, job_feed_db_id, upwork_person_id, upwork_nid, upwork_org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings) return err("bad_request", "unknown user");
  if (!settings.upwork_person_id || !settings.upwork_nid || !settings.upwork_org_id) {
    return err("bad_request", "missing Upwork ids — reconnect Upwork to populate them");
  }
  if (!settings.notion_token) return err("bad_request", "user has no Notion token");

  const notion = getNotionForUser(settings.notion_token);
  const dbId = settings.job_feed_db_id ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");

  const inputs = await readJobApplyInputs(notion, externalId, { dbId });
  if (!inputs) return err("not_found", "job page not found in Notion");

  if (inputs.bid === null || !Number.isFinite(inputs.bid) || inputs.bid <= 0) {
    return err("bad_request", "set a positive Bid on the job row");
  }
  if (!inputs.coverLetter.trim() && inputs.coverLetterRequired)
    return err("bad_request", "fill the Cover Letter on the job row");

  const questions = parseNumberedList(inputs.questionsText);
  let answers: { question: string; answer: string }[] | undefined;
  if (questions.length > 0) {
    const answerItems = parseNumberedList(inputs.answersText);
    if (answerItems.length !== questions.length) {
      return err("bad_request", `Screening Answers must be a numbered list matching the questions (${questions.length} question(s), got ${answerItems.length})`);
    }
    answers = questions.map((question, i) => ({ question, answer: answerItems[i] }));
  }

  const token = await getValidAccessToken(userId);
  if (!token) return err("unauthorized", "no Upwork token");

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
    return err("upstream", e instanceof Error ? e.message : String(e));
  }

  const proposalUrl = `https://www.upwork.com/ab/proposals/${proposalId}`;
  let notionUpdated = false;
  try {
    notionUpdated = await markApplied(notion, externalId, proposalUrl, { dbId });
  } catch (e) {
    logger.warn({ err: e, externalId }, "proposal submitted but Notion markApplied failed");
  }

  return { ok: true, proposalId, proposalUrl, notionUpdated };
}
