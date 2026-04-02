import { Client } from "@notionhq/client";

let _notion: Client | null = null;
let _dbId: string | null = null;

function getNotion(): Client {
  if (!_notion) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is required");
    _notion = new Client({ auth: token });
  }
  return _notion;
}

function getDbId(): string {
  if (!_dbId) {
    const id = process.env.NOTION_DATABASE_ID;
    if (!id) throw new Error("NOTION_DATABASE_ID is required");
    _dbId = id;
  }
  return _dbId;
}

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

export function buildProps(item: NotionItem) {
  const props: Record<string, any> = {
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
  const notion = getNotion();
  const dbId = getDbId();

  try {
    const resp: any = await notion.request({
      path: `databases/${dbId}/query`,
      method: "post",
      body: {
        filter: {
          property: "External ID",
          rich_text: { equals: externalId },
        },
      },
    });
    if (resp?.results?.length) return resp.results[0].id as string;
  } catch {
    try {
      const respAll: any = await notion.request({
        path: `databases/${dbId}/query`,
        method: "post",
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

export async function upsertToNotion(item: NotionItem): Promise<"created" | "updated"> {
  const notion = getNotion();
  const dbId = getDbId();
  const props = buildProps(item);

  const existingId = await findPageIdByExternalId(item.externalId);
  if (existingId) {
    await notion.pages.update({ page_id: existingId, properties: props as any });
    return "updated";
  }

  await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
  return "created";
}

// Re-export for notionSeed.ts and other consumers that need the raw client
export { getNotion, getDbId };
