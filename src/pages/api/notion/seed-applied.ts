import type { NextApiRequest, NextApiResponse } from "next";
import { createDemoContracts } from "@/lib/notionSeed";

export const config = { runtime: "nodejs" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const count = Number(req.query.count ?? 10);
    const normalizedCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 10;
    const result = await createDemoContracts(normalizedCount);
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    return res.status(500).json({ ok: false, error: message });
  }
}
