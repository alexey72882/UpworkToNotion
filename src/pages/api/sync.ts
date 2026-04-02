import type { NextApiRequest, NextApiResponse } from "next";
import { upsertToNotion } from "@/lib/notion";
import { fetchUpworkItems } from "@/lib/upwork";
import { requireAuth } from "@/lib/requireAuth";
import { logger } from "@/lib/logger";

type Ok = {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
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
    const items = await fetchUpworkItems();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        const result = await upsertToNotion(item);
        if (result === "created") created++;
        else updated++;
      } catch (err) {
        skipped++;
        logger.warn({ externalId: item.externalId, err }, "upsert failed, skipping");
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ created, updated, skipped, durationMs }, "sync completed");

    return res.status(200).json({ ok: true, created, updated, skipped, durationMs });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    logger.error({ err }, "sync failed");
    return res.status(500).json({ ok: false, error: message });
  }
}