import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });
export const NOTION_DB = process.env.NOTION_DATABASE_ID as string;

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

export async function upsertToNotion(
  item: NotionItem,
): Promise<"created" | "updated"> {
  const found = await notion.databases.query({
    database_id: NOTION_DB,
    filter: {
      property: "External ID",
      rich_text: { equals: item.externalId },
    },
  });

  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: item.title } }] },
    Stage: { select: { name: item.stage } },
    Type: { select: { name: item.type } },
    "External ID": { rich_text: [{ text: { content: item.externalId } }] },
  };
  if (item.client)
    props.Client = { rich_text: [{ text: { content: item.client } }] };
  if (item.value !== undefined) props.Value = { number: item.value };
  if (item.currency) props.Currency = { select: { name: item.currency } };
  if (item.url) props["Upwork Link"] = { url: item.url };
  if (item.created) props.Created = { date: { start: item.created } };
  if (item.updated) props.Updated = { date: { start: item.updated } };

  if (found.results.length) {
    await notion.pages.update({
      page_id: (found.results[0] as any).id,
      properties: props,
    });
    return "updated";
  }

  await notion.pages.create({
    parent: { database_id: NOTION_DB },
    properties: props,
  });
  return "created";
}
