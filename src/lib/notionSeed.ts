import { Client } from "@notionhq/client";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID =
  process.env.NOTION_DATABASE_ID ?? process.env.NOTION_DB_ID ?? undefined;

export async function createDemoContracts(count = 10) {
  if (!DB_ID) throw new Error("NOTION_DATABASE_ID (or NOTION_DB_ID) is required");

  const now = new Date().toISOString();
  const results: Array<{ ok: true; id: string } | { ok: false; error: string }> = [];

  for (let i = 1; i <= count; i++) {
    const props: CreatePageParameters = {
      parent: { database_id: DB_ID },
      properties: {
        Name: { title: [{ text: { content: `Demo sync item ${i}` } }] },
        Stage: { select: { name: "Applied" } },
        Type: { select: { name: "Proposal" } },
        Client: { rich_text: [{ text: { content: "Demo Client" } }] },
        Created: { date: { start: now } },
        "External ID": { rich_text: [{ text: { content: `demo-${i}` } }] },
        "Upwork Link": { url: "https://example.com" },
      },
    };

    try {
      const page = await notion.pages.create(props);
      results.push({ ok: true, id: page.id });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown error");
      results.push({ ok: false, error: message });
    }
  }

  const created = results.filter((r) => r.ok).length;
  return { ok: created === count, created, results };
}
