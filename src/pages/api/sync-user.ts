import type { NextApiRequest, NextApiResponse } from "next";
import { runUserSync, type UserSyncSummary } from "@/lib/syncPipeline";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type Err = { ok: false; error: string };

// Syncs a single user. Called by the /api/sync dispatcher (one invocation per user)
// so each user runs in its own function instance under its own timeout.
export default async function handler(req: NextApiRequest, res: NextApiResponse<UserSyncSummary | Err>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  if (!requireAuth(req, res)) return;

  const userId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
  const force = typeof req.body?.force === "string" ? req.body.force : undefined;
  if (!userId) return res.status(400).json({ ok: false, error: "userId required" });

  try {
    const summary = await runUserSync(userId, force);
    return res.status(200).json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ userId, err }, "sync-user failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
