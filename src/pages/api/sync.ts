import type { NextApiRequest, NextApiResponse } from "next";
import { readJobFilters, upsertJobFeedItem, upsertContractDayItem } from "@/lib/notion";
import { fetchJobFeed, fetchContractDays, getCurrentWeekRange } from "@/lib/upwork";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type Ok = {
  ok: true;
  jobs: { fetched: number; created: number; updated: number; skipped: number };
  contracts: { fetched: number; created: number; updated: number; skipped: number };
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
    const filters = await readJobFilters();
    logger.info({ filterCount: filters.length }, "loaded job filters");

    const { rangeStart, rangeEnd } = getCurrentWeekRange();
    const [jobItems, contractItems] = await Promise.all([
      fetchJobFeed(filters),
      fetchContractDays(rangeStart, rangeEnd),
    ]);

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

    let contractCreated = 0, contractUpdated = 0, contractSkipped = 0;
    for (const item of contractItems) {
      try {
        const result = await upsertContractDayItem(item);
        if (result === "created") contractCreated++; else contractUpdated++;
      } catch (err) {
        contractSkipped++;
        logger.warn({ externalId: item.externalId, err }, "contract upsert failed, skipping");
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ jobCreated, jobUpdated, jobSkipped, contractCreated, contractUpdated, contractSkipped, durationMs }, "sync completed");

    return res.status(200).json({
      ok: true,
      jobs: { fetched: jobItems.length, created: jobCreated, updated: jobUpdated, skipped: jobSkipped },
      contracts: { fetched: contractItems.length, created: contractCreated, updated: contractUpdated, skipped: contractSkipped },
      durationMs,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    logger.error({ err }, "sync failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
