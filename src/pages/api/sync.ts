import type { NextApiRequest, NextApiResponse } from "next";
import { runUserSync, type UserResult, type UserSyncSummary } from "@/lib/syncPipeline";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type Ok = {
  ok: true;
  users: number;
  jobs: UserResult;
  contracts: UserResult;
  durationMs: number;
};

type Err = { ok: false; error: string };

function addInto(total: UserResult, r: UserResult) {
  total.fetched += r.fetched;
  total.created += r.created;
  total.updated += r.updated;
  total.skipped += r.skipped;
}

// Dispatcher: fires one /api/sync-user call per user in parallel so each runs in its
// own function instance/timeout, instead of syncing all users in this one 60s function.
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const force = typeof req.query.force === "string" ? req.query.force : undefined;
  const start = Date.now();
  logger.info("sync dispatch started");

  try {
    // Dashboard "Sync Now" (session): sync just that user inline — no fan-out needed.
    if (!requireAuth(req, res, { silent: true })) {
      const supabase = getSupabaseServer(req, res);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
      const s = await runUserSync(user.id, force);
      return res.status(200).json({ ok: true, users: 1, jobs: s.jobs, contracts: s.contracts, durationMs: Date.now() - start });
    }

    // Cron path (Bearer API_SECRET): fan out one call per user.
    const { data: rows } = await getSupabase()
      .from("user_settings")
      .select("user_id")
      .not("notion_token", "is", null);
    const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
    logger.info({ userCount: userIds.length }, "dispatching per-user syncs");

    const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
    const base = `${proto}://${req.headers.host}`;
    const secret = process.env.API_SECRET;

    const settled = await Promise.allSettled(
      userIds.map(userId =>
        fetch(`${base}/api/sync-user`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId, force }),
        }).then(r => r.json() as Promise<UserSyncSummary | Err>),
      ),
    );

    const totals = { jobs: { fetched: 0, created: 0, updated: 0, skipped: 0 }, contracts: { fetched: 0, created: 0, updated: 0, skipped: 0 } };
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.ok) {
        addInto(totals.jobs, s.value.jobs);
        addInto(totals.contracts, s.value.contracts);
      } else {
        logger.error({ reason: s.status === "rejected" ? s.reason : s.value }, "per-user sync failed");
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ ...totals, durationMs }, "sync dispatch completed");
    return res.status(200).json({ ok: true, users: userIds.length, ...totals, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    logger.error({ err }, "sync dispatch failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
