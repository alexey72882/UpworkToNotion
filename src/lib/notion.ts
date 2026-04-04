import { Client } from "@notionhq/client";

let _notion: Client | null = null;

function getNotion(): Client {
  if (!_notion) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is required");
    _notion = new Client({ auth: token, notionVersion: "2022-06-28" });
  }
  return _notion;
}

function getDbId(envVar: string): string {
  const id = process.env[envVar];
  if (!id) throw new Error(`${envVar} is required`);
  return id;
}

// ---------------------------------------------------------------------------
// Job feed filters (read from Notion)
// ---------------------------------------------------------------------------

export type JobFilter = {
  name: string;
  skillExpression?: string;
  categoryIds?: string[];
  occupationIds?: string[];
  jobType?: "Hourly" | "Fixed";
  minBudget?: number;
  maxBudget?: number;
  experienceLevel?: "Entry" | "Intermediate" | "Expert";
  verifiedPaymentOnly?: boolean;
};

export async function readJobFilters(): Promise<JobFilter[]> {
  const notion = getNotion();
  const dbId = getDbId("NOTION_JOB_FILTERS_DATABASE_ID");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await notion.request({
    path: `databases/${dbId}/query`,
    method: "post",
    body: { filter: { property: "Active", checkbox: { equals: true } } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (resp?.results ?? []).map((page: any) => {
    const p = page.properties ?? {};
    const text = (key: string) =>
      p[key]?.rich_text?.[0]?.plain_text?.trim() || undefined;
    const num = (key: string) =>
      p[key]?.number ?? undefined;
    const sel = (key: string) =>
      p[key]?.select?.name ?? undefined;

    const rawCatIds = text("Category IDs");
    const rawOccIds = text("Occupation IDs");

    // Experience Level is multi_select — take first value only (API accepts one)
    const expLevels: string[] = (p["Experience Level"]?.multi_select ?? []).map((s: { name: string }) => s.name);

    return {
      name: p["Name"]?.title?.[0]?.plain_text?.trim() ?? "Unnamed",
      skillExpression: text("Skill Expression"),
      categoryIds: rawCatIds ? rawCatIds.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
      occupationIds: rawOccIds ? rawOccIds.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
      jobType: sel("Job Type") as JobFilter["jobType"] | undefined,
      minBudget: num("Min Budget"),
      maxBudget: num("Max Budget"),
      experienceLevel: expLevels[0] as JobFilter["experienceLevel"] | undefined,
      verifiedPaymentOnly: p["Verified Payment Only"]?.checkbox ?? undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Job feed DB upsert
// ---------------------------------------------------------------------------

export type JobFeedItem = {
  externalId: string;
  title: string;
  description?: string;
  client?: string;
  value?: number;
  currency?: string;
  url?: string;
  created?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildJobFeedProps(item: JobFeedItem): Record<string, any> {
  const props: Record<string, any> = {
    Name: { title: [{ text: { content: item.title } }] },
    "External ID": { rich_text: [{ text: { content: item.externalId } }] },
  };
  if (item.description)
    props["Description"] = { rich_text: [{ text: { content: item.description.slice(0, 2000) } }] };
  if (item.client)
    props["Client"] = { rich_text: [{ text: { content: item.client } }] };
  if (item.value !== undefined) props["Value"] = { number: item.value };
  if (item.currency) props["Currency"] = { select: { name: item.currency } };
  if (item.url) props["Upwork Link"] = { url: item.url };
  if (item.created) props["Created"] = { date: { start: item.created } };
  return props;
}

async function findPageByExternalId(dbId: string, externalId: string): Promise<string | null> {
  const notion = getNotion();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await notion.request({
      path: `databases/${dbId}/query`,
      method: "post",
      body: { filter: { property: "External ID", rich_text: { equals: externalId } } },
    });
    if (resp?.results?.length) return resp.results[0].id as string;
  } catch {
    // fall through — will create
  }
  return null;
}

export async function upsertJobFeedItem(item: JobFeedItem): Promise<"created" | "updated"> {
  const notion = getNotion();
  const dbId = getDbId("NOTION_JOB_FEED_DATABASE_ID");
  const props = buildJobFeedProps(item);

  const existingId = await findPageByExternalId(dbId, item.externalId);
  if (existingId) {
    await notion.pages.update({ page_id: existingId, properties: props as any });
    return "updated";
  }
  await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
  return "created";
}

// ---------------------------------------------------------------------------
// Contracts DB upsert
// ---------------------------------------------------------------------------

export type ContractItem = {
  externalId: string;
  title: string;
  client?: string;
  contractType?: "Hourly" | "Fixed";
  rate?: number;
  currency?: string;
  status?: string;
  startDate?: string;
  url?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContractProps(item: ContractItem): Record<string, any> {
  const props: Record<string, any> = {
    Name: { title: [{ text: { content: item.title } }] },
    "External ID": { rich_text: [{ text: { content: item.externalId } }] },
  };
  if (item.client) props["Client"] = { rich_text: [{ text: { content: item.client } }] };
  if (item.contractType) props["Contract Type"] = { select: { name: item.contractType } };
  if (item.rate !== undefined) props["Rate"] = { number: item.rate };
  if (item.currency) props["Currency"] = { select: { name: item.currency } };
  if (item.status) props["Status"] = { select: { name: item.status } };
  if (item.startDate) props["Start Date"] = { date: { start: item.startDate } };
  if (item.url) props["Upwork Link"] = { url: item.url };
  return props;
}

export async function upsertContractItem(item: ContractItem): Promise<"created" | "updated"> {
  const notion = getNotion();
  const dbId = getDbId("NOTION_CONTRACTS_DATABASE_ID");
  const props = buildContractProps(item);

  const existingId = await findPageByExternalId(dbId, item.externalId);
  if (existingId) {
    await notion.pages.update({ page_id: existingId, properties: props as any });
    return "updated";
  }
  await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
  return "created";
}

// Re-export for legacy consumers
export { getNotion, getDbId };

// ---------------------------------------------------------------------------
// Legacy — kept for backward compat during transition
// ---------------------------------------------------------------------------

export type NotionItem = {
  externalId: string;
  title: string;
  stage: "Applied" | "Viewed" | "Interview" | "Hired" | "Lead";
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

export async function upsertToNotion(item: NotionItem): Promise<"created" | "updated"> {
  const notion = getNotion();
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_DATABASE_ID is required");
  const props = buildProps(item);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await notion.request({
    path: `databases/${dbId}/query`,
    method: "post",
    body: { filter: { property: "External ID", rich_text: { equals: item.externalId } } },
  });

  if (resp?.results?.length) {
    await notion.pages.update({ page_id: resp.results[0].id, properties: props as any });
    return "updated";
  }
  await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
  return "created";
}
