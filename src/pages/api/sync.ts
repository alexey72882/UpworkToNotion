import type { NextApiRequest, NextApiResponse } from "next";
import { logger } from "@/lib/logger";
import { fetchUpworkItems, UpworkItem } from "@/lib/upwork";
import { upsertToNotion } from "@/lib/notion";
import { recordSync, rememberExternalId } from "@/lib/supabase";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const runId = `${Date.now()}`;
  const started = Date.now();
  logger.info({ runId }, "sync started");

  try {
    const raw = await fetchUpworkItems();
    let created = 0;
    let updated = 0;

    for (const r of raw) {
      const parsed = UpworkItem.parse(r);
      const action = await upsertToNotion(parsed);
      if (action === "created") created += 1;
      else updated += 1;
      await rememberExternalId(parsed.externalId);
    }

    const ms = Date.now() - started;
    logger.info({ runId, created, updated, ms }, "sync completed");
    await recordSync(runId, { created, updated, ms });

    res.status(200).json({ ok: true, created, updated, durationMs: ms });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String((err as { message?: unknown })?.message || err);
    logger.error({ runId, err: message }, "sync failed");
    await recordSync(runId, { error: message });
    res.status(500).json({ ok: false, error: "sync failed" });
  }
}
