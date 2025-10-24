import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DATABASE_ID;

if (!token) throw new Error("NOTION_TOKEN is required");
if (!dbId) throw new Error("NOTION_DATABASE_ID is required");

// v5 client
export const notion = new Client({ auth: token });
export const NOTION_DB = dbId as string;

export type NotionItem = {
  externalId: string;
  title: string;
  stage: "Applied" | "Viewed" | "Interview" | "Hired";
  type: "Proposal" | "Offer" | "Contract";
  client?: string;
  value?: number;
  currency?: string;
  url?: string;
  created?: string;
  updated?: string;
};

function buildProps(item: NotionItem) {
  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: item.title } }] },
    Stage: { select: { name: item.stage } },
    Type: { select: { name: item.type } },
    "External ID": { rich_text: [{ text: { content: item.externalId } }] },
  };
  if (item.client)
    (props as any).Client = { rich_text: [{ text: { content: item.client } }] };
  if (item.value !== undefined) (props as any).Value = { number: item.value };
  if (item.currency) (props as any).Currency = { select: { name: item.currency } };
  if (item.url) (props as any)["Upwork Link"] = { url: item.url };
  if (item.created) (props as any).Created = { date: { start: item.created } };
  if (item.updated) (props as any).Updated = { date: { start: item.updated } };
  return props;
}

async function findPageIdByExternalId(externalId: string): Promise<string | null> {
  try {
    // Use the generic request surface — reliable across SDK versions/runtimes.
    const resp: any = await notion.request({
      path: `databases/${NOTION_DB}/query`,
      method: "POST",
      body: {
        filter: {
          property: "External ID",
          rich_text: { equals: externalId },
        },
      },
    });
    if (resp?.results?.length) return resp.results[0].id as string;
  } catch {
    // Defensive fallback if the property is missing or misconfigured: query all then scan.
    try {
      const respAll: any = await notion.request({
        path: `databases/${NOTION_DB}/query`,
        method: "POST",
      });
      const match = (respAll?.results || []).find(
        (p: any) =>
          p?.properties?.["External ID"]?.rich_text?.[0]?.plain_text === externalId,
      );
      if (match) return match.id as string;
    } catch {
      // swallow – we'll create on upsert
    }
  }
  return null;
}

/**
 * v5-compatible upsert using `notion.request` for querying.
 */
export async function upsertToNotion(item: NotionItem): Promise<"created" | "updated"> {
  const props = buildProps(item);

  const existingId = await findPageIdByExternalId(item.externalId);
  if (existingId) {
    await notion.pages.update({ page_id: existingId, properties: props });
    return "updated";
  }

  await notion.pages.create({ parent: { database_id: NOTION_DB }, properties: props });
  return "created";
}
