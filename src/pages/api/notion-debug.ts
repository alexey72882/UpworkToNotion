import type { NextApiRequest, NextApiResponse } from "next";
import { notion } from "@/lib/notion";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const ok = typeof (notion as any)?.databases?.retrieve === "function";
    res.status(200).json({ ok });
  } catch (e) {
    const error =
      e instanceof Error ? e.message : String((e as { message?: unknown })?.message || e);
    res.status(500).json({ ok: false, error });
  }
}
