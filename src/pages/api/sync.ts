import type { NextApiRequest, NextApiResponse } from "next";
import { readJobFilters, upsertJobFeedItem } from "@/lib/notion";
import { fetchJobFeed } from "@/lib/upwork";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type Ok = {
  ok: true;
  jobs: { fetched: number; created: number; updated: number; skipped: number };
  durationMs: number;
};

type Err = {
  ok: false;
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>,
) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const start = Date.now();
  logger.info("sync started");

  try {
    // Read filters from Notion, then fetch jobs + contracts in parallel
    const filters = await readJobFilters();
    logger.info({ filterCount: filters.length }, "loaded job filters");

    const jobItems = await fetchJobFeed(filters);

    let jobCreated = 0, jobUpdated = 0, jobSkipped = 0;
    for (const item of jobItems) {
      try {
        const result = await upsertJobFeedItem(item);
        if (result === "created") jobCreated++; else jobUpdated++;
      } catch (err) {
        jobSkipped++;
        logger.warn({ externalId: item.externalId, err }, "job upsert failed, skipping");
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ jobCreated, jobUpdated, jobSkipped, durationMs }, "sync completed");

    return res.status(200).json({
      ok: true,
      jobs: { fetched: jobItems.length, created: jobCreated, updated: jobUpdated, skipped: jobSkipped },
      durationMs,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    logger.error({ err }, "sync failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
