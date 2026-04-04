import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import { getNotion, getDbId } from "@/lib/notion";

export async function createDemoContracts(count = 10) {
  const notion = getNotion();
  const dbId = getDbId("NOTION_DATABASE_ID");
  const now = new Date().toISOString();
  const results: Array<{ ok: true; id: string } | { ok: false; error: string }> = [];

  for (let i = 1; i <= count; i++) {
    const props: CreatePageParameters = {
      parent: { database_id: dbId },
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
