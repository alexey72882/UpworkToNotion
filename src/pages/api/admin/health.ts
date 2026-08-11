import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

// Read-only operator view across ALL users. Session-authed, then gated to the
// emails in ADMIN_EMAILS (comma-separated). Uses the service-role client to read
// past RLS. No writes, no tokens/secrets in the response.
const WINDOW_MS = 24 * 60 * 60 * 1000;

type SettingsRow = {
  user_id: string;
  upwork_name: string | null;
  notion_token: string | null;
  job_feed_db_id: string | null;
  mcp_token: string | null;
  upwork_person_id: string | null;
  last_sync_at: string | null;
  last_sync_result: unknown | null;
  total_jobs_created: number | null;
  total_diary_synced: number | null;
};

type LogRow = {
  user_id: string;
  created_at: string;
  jobs_created: number | null;
  jobs_updated: number | null;
  jobs_skipped: number | null;
  duration_ms: number | null;
  error: string | null;
};

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  if (!isAdmin(user.email)) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    const db = getSupabase();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const [settingsRes, tokensRes, logsRes] = await Promise.all([
      db.from("user_settings").select(
        "user_id, upwork_name, notion_token, job_feed_db_id, mcp_token, upwork_person_id, last_sync_at, last_sync_result, total_jobs_created, total_diary_synced",
      ),
      db.from("upwork_tokens").select("user_id, expires_at"),
      db.from("sync_logs").select("user_id, created_at, jobs_created, jobs_updated, jobs_skipped, duration_ms, error").gte("created_at", since),
    ]);

    if (settingsRes.error) throw settingsRes.error;

    const settings = (settingsRes.data ?? []) as SettingsRow[];
    const expiryByUser = new Map<string, number>();
    for (const t of (tokensRes.data ?? []) as { user_id: string | null; expires_at: number | null }[]) {
      if (t.user_id && t.expires_at != null) expiryByUser.set(t.user_id, t.expires_at);
    }

    // Aggregate the 24h log window per user.
    const agg = new Map<string, { runs: number; errors: number; jobsCreated: number; jobsUpdated: number; jobsSkipped: number; lastError: { at: string; message: string } | null }>();
    for (const l of (logsRes.data ?? []) as LogRow[]) {
      const a = agg.get(l.user_id) ?? { runs: 0, errors: 0, jobsCreated: 0, jobsUpdated: 0, jobsSkipped: 0, lastError: null };
      a.runs++;
      a.jobsCreated += l.jobs_created ?? 0;
      a.jobsUpdated += l.jobs_updated ?? 0;
      a.jobsSkipped += l.jobs_skipped ?? 0;
      if (l.error) {
        a.errors++;
        // logsRes isn't ordered; keep the most recent error by created_at.
        if (!a.lastError || l.created_at > a.lastError.at) a.lastError = { at: l.created_at, message: l.error };
      }
      agg.set(l.user_id, a);
    }

    const now = Date.now();
    const users = settings.map((s) => {
      const window = agg.get(s.user_id) ?? { runs: 0, errors: 0, jobsCreated: 0, jobsUpdated: 0, jobsSkipped: 0, lastError: null };
      const expiresAtMs = expiryByUser.get(s.user_id) ?? null;
      return {
        userId: s.user_id,
        name: s.upwork_name,
        connected: {
          upwork: !!s.upwork_person_id,
          notion: !!s.notion_token,
          jobFeedDb: !!s.job_feed_db_id,
          mcp: !!s.mcp_token,
        },
        token: {
          expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
          expired: expiresAtMs ? expiresAtMs < now : null,
        },
        lastSyncAt: s.last_sync_at,
        lastResult: s.last_sync_result,
        totals: {
          jobsCreated: s.total_jobs_created ?? 0,
          diarySynced: s.total_diary_synced ?? 0,
        },
        last24h: {
          runs: window.runs,
          errors: window.errors,
          jobsCreated: window.jobsCreated,
          jobsUpdated: window.jobsUpdated,
          jobsSkipped: window.jobsSkipped,
        },
        lastError: window.lastError,
      };
    });

    // Surface the users needing attention first: errors, then stale, then name.
    users.sort((a, b) =>
      b.last24h.errors - a.last24h.errors ||
      (a.lastSyncAt ?? "").localeCompare(b.lastSyncAt ?? "") ||
      (a.name ?? "").localeCompare(b.name ?? ""),
    );

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowHours: 24,
      summary: {
        users: users.length,
        connectedUpwork: users.filter((u) => u.connected.upwork).length,
        expiredTokens: users.filter((u) => u.token.expired).length,
        usersWithErrors24h: users.filter((u) => u.last24h.errors > 0).length,
        runs24h: users.reduce((n, u) => n + u.last24h.runs, 0),
        errors24h: users.reduce((n, u) => n + u.last24h.errors, 0),
      },
      users,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "admin health failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
