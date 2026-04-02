import type { NextApiRequest, NextApiResponse } from "next";
import { getNotion, getDbId } from "@/lib/notion";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const notion = getNotion();
    const dbId = getDbId();
    const db = await notion.databases.retrieve({ database_id: dbId });
    return res.status(200).json({ ok: true, title: (db as any).title?.[0]?.plain_text ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: message });
  }
}
