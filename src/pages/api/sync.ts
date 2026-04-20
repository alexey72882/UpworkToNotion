import type { NextApiRequest, NextApiResponse } from "next";
import { readJobFilters, upsertJobFeedItem, upsertContractDayItem, getNotionForUser } from "@/lib/notion";
import { fetchUpworkItems, fetchJobFeed, fetchContractDays, getCurrentWeekRange } from "@/lib/upwork";
import { getValidAccessToken } from "@/lib/upworkToken";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type UserResult = {
  fetched: number; created: number; updated: number; skipped: number;
};

type Ok = {
  ok: true;
  users: number;
  jobs: UserResult;
  contracts: UserResult;
  durationMs: number;
};

type Err = { ok: false; error: string };

type UserSettings = {
  user_id: string;
  notion_token: string;
  job_feed_db_id: string | null;
  filters_db_id: string | null;
  diary_db_id: string | null;
  upwork_person_id: string | null;
};

async function syncUser(settings: UserSettings) {
  const notion = getNotionForUser(settings.notion_token);
  const token = await getValidAccessToken(settings.user_id);
  if (!token) {
    logger.warn({ userId: settings.user_id }, "no Upwork token for user, skipping");
    return null;
  }

  const { rangeStart, rangeEnd } = getCurrentWeekRange();
  const [proposals, jobItems, contractItems] = await Promise.all([
    fetchUpworkItems(token),
    settings.filters_db_id
      ? fetchJobFeed(await readJobFilters({ notion, dbId: settings.filters_db_id }), token)
      : Promise.resolve([]),
    settings.diary_db_id && settings.upwork_person_id
      ? fetchContractDays(rangeStart, rangeEnd, token, settings.upwork_person_id)
      : Promise.resolve([]),
  ]);

  // Cross-reference: map jobPostingId → proposal URL
  const proposalByJobId = new Map<string, string>();
  for (const p of proposals) {
    if (p.url) {
      const jobId = p.url.split("/jobs/").pop();
      if (jobId) proposalByJobId.set(jobId, p.externalId);
    }
  }
  for (const item of jobItems) {
    const jobId = item.externalId.replace("job-", "");
    const proposalId = proposalByJobId.get(jobId);
    if (proposalId) item.proposalUrl = `https://www.upwork.com/ab/proposals/${proposalId}`;
  }

  let jobCreated = 0, jobUpdated = 0, jobSkipped = 0;
  const notionOpts = settings.job_feed_db_id ? { notion, dbId: settings.job_feed_db_id } : undefined;
  for (const item of jobItems) {
    try {
      const result = await upsertJobFeedItem(item, notionOpts);
      if (result === "created") jobCreated++; else jobUpdated++;
    } catch (err) {
      jobSkipped++;
      logger.warn({ externalId: item.externalId, err }, "job upsert failed, skipping");
    }
  }

  let contractCreated = 0, contractUpdated = 0, contractSkipped = 0;
  const diaryOpts = settings.diary_db_id ? { notion, dbId: settings.diary_db_id } : undefined;
  for (const item of contractItems) {
    try {
      const result = await upsertContractDayItem(item, diaryOpts);
      if (result === "created") contractCreated++; else contractUpdated++;
    } catch (err) {
      contractSkipped++;
      logger.warn({ externalId: item.externalId, err }, "contract upsert failed, skipping");
    }
  }

  return {
    jobs: { fetched: jobItems.length, created: jobCreated, updated: jobUpdated, skipped: jobSkipped },
    contracts: { fetched: contractItems.length, created: contractCreated, updated: contractUpdated, skipped: contractSkipped },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const start = Date.now();
  logger.info("sync started");

  try {
    let userIds: string[];

    // GitHub Actions / cron path: Bearer API_SECRET → sync all users
    if (requireAuth(req, res, { silent: true })) {
      const { data: rows } = await getSupabase()
        .from("user_settings")
        .select("user_id")
        .not("notion_token", "is", null);
      userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
    } else {
      // Dashboard "Sync Now": derive user from session
      const supabase = getSupabaseServer(req, res);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
      userIds = [user.id];
    }

    logger.info({ userCount: userIds.length }, "syncing users");

    const totals = { jobs: { fetched: 0, created: 0, updated: 0, skipped: 0 }, contracts: { fetched: 0, created: 0, updated: 0, skipped: 0 } };

    for (const userId of userIds) {
      const { data: settings } = await getSupabase()
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle<UserSettings>();

      if (!settings?.notion_token) {
        logger.warn({ userId }, "user has no notion settings, skipping");
        continue;
      }

      try {
        const result = await syncUser(settings);
        if (result) {
          totals.jobs.fetched += result.jobs.fetched;
          totals.jobs.created += result.jobs.created;
          totals.jobs.updated += result.jobs.updated;
          totals.jobs.skipped += result.jobs.skipped;
          totals.contracts.fetched += result.contracts.fetched;
          totals.contracts.created += result.contracts.created;
          totals.contracts.updated += result.contracts.updated;
          totals.contracts.skipped += result.contracts.skipped;
        }
      } catch (err) {
        logger.error({ userId, err }, "user sync failed, skipping");
      }

      // Update last_sync_at
      await getSupabase()
        .from("user_settings")
        .update({ last_sync_at: new Date().toISOString(), last_sync_result: totals, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }

    const durationMs = Date.now() - start;
    logger.info({ ...totals, durationMs }, "sync completed");

    return res.status(200).json({ ok: true, users: userIds.length, ...totals, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    logger.error({ err }, "sync failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
