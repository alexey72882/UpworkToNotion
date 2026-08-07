import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/lib/requireAuth";
import { runSubmit, type ApplyErrorCode } from "@/lib/apply";

export const config = { runtime: "nodejs" };

const STATUS: Record<ApplyErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  unauthorized: 401,
  upstream: 502,
};

// Agent/user-facing: submit a proposal using the Bid / Cover Letter / Screening
// Answers the human (or agent) filled on the job's Notion row.
// POST { externalId, userId }  (Authorization: Bearer API_SECRET)
// Spends Connects — identity is required (never inferred).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "use POST" });
  }

  // Identity is required — this spends the user's Connects, so never infer it.
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required" });
  }

  const result = await runSubmit(userId, String(req.body?.externalId ?? ""));
  if (!result.ok) {
    return res.status(STATUS[result.code]).json({ ok: false, error: result.error });
  }
  return res.status(200).json(result);
}
