import { upsertJobFeedItem, upsertContractDayItem, fetchJobFeedPageMap, fetchDiaryPageMap, pruneJobFeed, getNotionForUser } from "@/lib/notion";
import { fetchUpworkItems, fetchJobFeed, fetchContractDays, getCurrentWeekRange } from "@/lib/upwork";
import { webFilterToJobFilters } from "@/lib/webFilter";
import { getValidAccessToken } from "@/lib/upworkToken";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const PROPOSALS_INTERVAL_MS = 60 * 60 * 1000;   // 1 hour
const DIARY_INTERVAL_MS    = 10 * 60 * 1000;   // 10 minutes
const PRUNE_INTERVAL_MS    = 24 * 60 * 60 * 1000; // 1 day
const JOB_FEED_CAP         = 1000;              // max rows kept in the job feed DB
const PRUNE_MAX_PER_RUN    = 50;               // bound archives/run to stay under timeout

export type UserResult = {
  fetched: number; created: number; updated: number; skipped: number;
};

export type UserSyncSummary = {
  userId: string;
  ok: boolean;
  error: string | null;
  jobs: UserResult;
  contracts: UserResult;
  durationMs: number;
};

type UserSettings = {
  user_id: string;
  notion_token: string;
  job_feed_db_id: string | null;
  diary_db_id: string | null;
  upwork_person_id: string | null;
  upwork_name: string | null;
  total_jobs_created: number | null;
  total_diary_synced: number | null;
  web_filter: unknown | null;
  last_proposals_sync_at: string | null;
  last_diary_sync_at: string | null;
  last_prune_at: string | null;
  last_sync_at: string | null;
};

async function syncUser(settings: UserSettings, force?: string) {
  const notion = getNotionForUser(settings.notion_token);
  const token = await getValidAccessToken(settings.user_id);
  if (!token) {
    logger.warn({ userId: settings.user_id }, "no Upwork token for user, skipping");
    return null;
  }

  // One-time: fetch and save first name if missing
  if (!settings.upwork_name) {
    try {
      const meRes = await fetch("https://api.upwork.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ user { name } }" }),
      });
      const me = await meRes.json();
      const firstName = String(me?.data?.user?.name ?? "").split(/\s+/)[0];
      if (firstName) {
        await getSupabase().from("user_settings").update({ upwork_name: firstName }).eq("user_id", settings.user_id);
      }
    } catch (err) {
      logger.warn({ err }, "Could not fetch Upwork name");
    }
  }

  const now = Date.now();
  const shouldFetchProposals = force === "proposals" || !settings.last_proposals_sync_at ||
    now - new Date(settings.last_proposals_sync_at).getTime() >= PROPOSALS_INTERVAL_MS;
  const shouldFetchDiary = force === "diary" || !settings.last_diary_sync_at ||
    now - new Date(settings.last_diary_sync_at).getTime() >= DIARY_INTERVAL_MS;

  logger.info({ shouldFetchProposals, shouldFetchDiary }, "sync track decisions");

  const { rangeStart, rangeEnd } = getCurrentWeekRange();
  const [proposals, jobItems, contractItems] = await Promise.all([
    shouldFetchProposals ? fetchUpworkItems(token) : Promise.resolve([]),
    fetchJobFeed(webFilterToJobFilters(settings.web_filter as never), token),
    shouldFetchDiary && settings.diary_db_id
      ? fetchContractDays(rangeStart, rangeEnd, token, settings.upwork_person_id ?? undefined)
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

  let jobCreated = 0, jobUpdated = 0, jobSkipped = 0, jobsError: string | null = null;
  const recentJobs: { title: string; action: "created" | "updated" | "skipped" }[] = jobItems.map(i => ({ title: i.title, action: "skipped" as const }));
  if (jobItems.length > 0 && settings.job_feed_db_id) {
    try {
      const jobPageMap = await fetchJobFeedPageMap(jobItems.map(i => i.externalId), { notion, dbId: settings.job_feed_db_id });
      for (let i = 0; i < jobItems.length; i++) {
        const item = jobItems[i];
        try {
          const result = await upsertJobFeedItem(item, { notion, dbId: settings.job_feed_db_id, pageMap: jobPageMap });
          if (result === "created") jobCreated++; else jobUpdated++;
          recentJobs[i].action = result;
        } catch (err) {
          jobSkipped++;
          logger.warn({ externalId: item.externalId, err }, "job upsert failed, skipping");
        }
      }
    } catch (err) {
      jobsError = err instanceof Error ? err.message : String(err);
      jobSkipped = jobItems.length;
      logger.error({ err }, "job feed Notion error — DB may be disconnected");
    }
  }

  // Cap the job-feed DB. Prune daily, or immediately after a run that created jobs
  // (the only way to exceed the cap). While still draining a backlog we hit the
  // per-run limit, so we hold off advancing the daily clock until we've caught up.
  let pruned = 0;
  let pruneClockAdvanced = false;
  const shouldPrune = force === "prune" || jobCreated > 0 || !settings.last_prune_at ||
    now - new Date(settings.last_prune_at).getTime() >= PRUNE_INTERVAL_MS;
  if (shouldPrune && settings.job_feed_db_id) {
    try {
      pruned = await pruneJobFeed({ notion, dbId: settings.job_feed_db_id, keep: JOB_FEED_CAP, max: PRUNE_MAX_PER_RUN });
      pruneClockAdvanced = pruned < PRUNE_MAX_PER_RUN;
      logger.info({ pruned, caughtUp: pruneClockAdvanced }, "job feed pruned");
    } catch (err) {
      logger.error({ err }, "job feed prune failed");
    }
  }

  let contractCreated = 0, contractUpdated = 0, contractSkipped = 0;
  if (contractItems.length > 0 && settings.diary_db_id) {
    const pageMap = await fetchDiaryPageMap(rangeStart, rangeEnd, { notion, dbId: settings.diary_db_id });
    for (const item of contractItems) {
      try {
        const result = await upsertContractDayItem(item, { notion, dbId: settings.diary_db_id, pageMap });
        if (result === "created") contractCreated++; else contractUpdated++;
      } catch (err) {
        contractSkipped++;
        logger.warn({ externalId: item.externalId, err }, "contract upsert failed, skipping");
      }
    }
  }

  return {
    jobs: { fetched: jobItems.length, created: jobCreated, updated: jobUpdated, skipped: jobSkipped, recentJobs, error: jobsError },
    contracts: { fetched: contractItems.length, created: contractCreated, updated: contractUpdated, skipped: contractSkipped },
    proposalsSynced: shouldFetchProposals,
    diarySynced: shouldFetchDiary,
    pruned,
    pruneClockAdvanced,
  };
}

const EMPTY: UserResult = { fetched: 0, created: 0, updated: 0, skipped: 0 };

// Sync one user end-to-end: load settings, run the pipeline, write sync_logs and
// update user_settings. Measures its own duration (per-user, correct under fan-out).
export async function runUserSync(userId: string, force?: string): Promise<UserSyncSummary> {
  const start = Date.now();

  const { data: settings } = await getSupabase()
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<UserSettings>();

  if (!settings?.notion_token) {
    logger.warn({ userId }, "user has no notion settings, skipping");
    return { userId, ok: false, error: "no_settings", jobs: EMPTY, contracts: EMPTY, durationMs: Date.now() - start };
  }

  let result: Awaited<ReturnType<typeof syncUser>> = null;
  let syncError: string | null = null;
  try {
    result = await syncUser(settings, force);
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err);
    logger.error({ userId, err }, "user sync failed, skipping");
  }

  const durationMs = Date.now() - start;

  await getSupabase().from("sync_logs").insert({
    user_id: userId,
    jobs_fetched: result?.jobs.fetched ?? 0,
    jobs_created: result?.jobs.created ?? 0,
    jobs_updated: result?.jobs.updated ?? 0,
    jobs_skipped: result?.jobs.skipped ?? 0,
    contracts_fetched: result?.contracts.fetched ?? 0,
    contracts_created: result?.contracts.created ?? 0,
    contracts_updated: result?.contracts.updated ?? 0,
    contracts_skipped: result?.contracts.skipped ?? 0,
    proposals_synced: result?.proposalsSynced ?? false,
    diary_synced: result?.diarySynced ?? false,
    duration_ms: durationMs,
    error: syncError ?? (result === null ? "no_token" : null),
  });

  const now = new Date().toISOString();
  await getSupabase()
    .from("user_settings")
    .update({
      prev_sync_at: settings.last_sync_at,
      last_sync_at: now,
      last_sync_result: result ? { jobs: result.jobs, contracts: result.contracts } : null,
      total_jobs_created: (settings.total_jobs_created ?? 0) + (result?.jobs.created ?? 0),
      total_diary_synced: (settings.total_diary_synced ?? 0) + (result?.contracts.fetched ?? 0),
      updated_at: now,
      ...(result?.proposalsSynced && { last_proposals_sync_at: now }),
      ...(result?.diarySynced && { last_diary_sync_at: now }),
      ...(result?.pruneClockAdvanced && { last_prune_at: now }),
    })
    .eq("user_id", userId);

  return {
    userId,
    ok: !syncError,
    error: syncError,
    jobs: result ? { fetched: result.jobs.fetched, created: result.jobs.created, updated: result.jobs.updated, skipped: result.jobs.skipped } : EMPTY,
    contracts: result?.contracts ?? EMPTY,
    durationMs,
  };
}
