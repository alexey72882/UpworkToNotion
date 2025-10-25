// src/pages/api/sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { upsertToNotion, type NotionItem } from "@/lib/notion";

type Ok = {
  ok: true;
  created: number;
  updated: number;
  durationMs: number;
};

type Err = {
  ok: false;
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  // Vercel cron uses GET, so enforce it
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const start = Date.now();

  try {
    // TODO: replace with real Upwork → Notion mapping.
    // Example single-item upsert so the route does something meaningful:
    const demoItem: NotionItem = {
      externalId: "demo-1",
      title: "Demo sync item",
      stage: "Applied",
      type: "Proposal",
      url: "https://example.com",
    };

    const result = await upsertToNotion(demoItem);
    const created = result === "created" ? 1 : 0;
    const updated = result === "updated" ? 1 : 0;

    return res.status(200).json({
      ok: true,
      created,
      updated,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    return res.status(500).json({ ok: false, error: message });
  }
}