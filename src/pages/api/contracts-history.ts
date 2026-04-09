import type { NextApiRequest, NextApiResponse } from "next";
import { upsertContractDayItem } from "@/lib/notion";
import { fetchContractDays } from "@/lib/upwork";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

export const config = { runtime: "nodejs" };

type Ok = {
  ok: true;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  durationMs: number;
};

type Err = { ok: false; error: string };

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
  const year = new Date().getUTCFullYear();
  const fromDate = `${year}0101`;
  const toDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  logger.info({ fromDate, toDate }, "contracts-history started");

  try {
    const items = await fetchContractDays(fromDate, toDate);
    logger.info({ fetched: items.length }, "contract days fetched");

    let created = 0, updated = 0, skipped = 0;
    for (const item of items) {
      try {
        const result = await upsertContractDayItem(item);
        if (result === "created") created++; else updated++;
      } catch (err) {
        skipped++;
        logger.warn({ externalId: item.externalId, err }, "upsert failed, skipping");
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ created, updated, skipped, durationMs }, "contracts-history done");

    return res.status(200).json({ ok: true, fetched: items.length, created, updated, skipped, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "contracts-history failed");
    return res.status(500).json({ ok: false, error: message });
  }
}
