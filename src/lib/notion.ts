import { Client } from "@notionhq/client";
import { withRetry } from "@/lib/retry";

// Retrying wrappers around raw Notion API calls — transient 429/5xx back off and retry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notionRequest(notion: Client, args: any): Promise<any> {
  return withRetry(() => notion.request(args), { label: "notion.request" });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notionUpdate(notion: Client, args: any) {
  return withRetry(() => notion.pages.update(args), { label: "notion.pages.update" });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notionCreate(notion: Client, args: any) {
  return withRetry(() => notion.pages.create(args), { label: "notion.pages.create" });
}

let _notion: Client | null = null;

function getNotion(): Client {
  if (!_notion) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is required");
    _notion = new Client({ auth: token, notionVersion: "2022-06-28" });
  }
  return _notion;
}

export function getNotionForUser(token: string): Client {
  return new Client({ auth: token, notionVersion: "2022-06-28" });
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
  searchExpression?: string;     // composed from advanced search fields
  titleExpression?: string;      // title-only search
  categoryIds?: string[];        // category labels — mapped to IDs in upwork.ts
  subcategoryIds?: string[];     // subcategory labels — mapped to IDs in upwork.ts
  jobType?: "Hourly" | "Fixed";
  minBudget?: number;
  maxBudget?: number;
  experienceLevel?: "Entry" | "Intermediate" | "Expert";
  verifiedPaymentOnly?: boolean;
  duration?: string[];           // "Week" | "Month" | "Quarter" | "Semester" | "Ongoing"
  daysPosted?: number;
  maxProposals?: number;
  minClientHires?: number;
  minClientRating?: number;
  previousClientsOnly?: boolean;
  enterpriseOnly?: boolean;
};

export async function readJobFilters(opts?: { notion?: Client; dbId?: string }): Promise<JobFilter[]> {
  const notion = opts?.notion ?? getNotion();
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FILTERS_DATABASE_ID");

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
    const multiSel = (key: string): string[] =>
      (p[key]?.multi_select ?? []).map((s: { name: string }) => s.name);

    const categoryLabels = multiSel("Category");
    const subcategoryLabels = multiSel("Subcategory");
    const expLevels = multiSel("Experience Level");
    const durationVals = multiSel("Duration");

    return {
      name: p["Name"]?.title?.[0]?.plain_text?.trim() ?? "Unnamed",
      skillExpression: text("Skill Expression"),
      categoryIds: categoryLabels.length ? categoryLabels : undefined,
      subcategoryIds: subcategoryLabels.length ? subcategoryLabels : undefined,
      jobType: sel("Job Type") as JobFilter["jobType"] | undefined,
      minBudget: num("Min Budget"),
      maxBudget: num("Max Budget"),
      experienceLevel: expLevels[0] as JobFilter["experienceLevel"] | undefined,
      verifiedPaymentOnly: p["Verified Payment Only"]?.checkbox || undefined,
      duration: durationVals.length ? durationVals : undefined,
      workload: sel("Workload") || undefined,
      daysPosted: num("Days Posted"),
      maxProposals: num("Max Proposals"),
      minClientHires: num("Min Client Hires"),
      minClientRating: num("Min Client Rating"),
      previousClientsOnly: p["Previous Clients Only"]?.checkbox || undefined,
      enterpriseOnly: p["Enterprise Only"]?.checkbox || undefined,
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
  rateMin?: number;
  rateMax?: number;
  url?: string;
  created?: string;
  jobType?: "Hourly" | "Fixed";
  experienceLevel?: "Entry" | "Intermediate" | "Expert";
  projectLength?: string;
  workload?: string;
  paymentVerified?: boolean;
  clientRating?: number;
  clientReviews?: number;
  clientSpent?: number;
  clientHires?: number;
  applicants?: number;
  skills?: string[];
  preferredLocation?: string;
  locationRequired?: boolean;
  enterprise?: boolean;
  screeningQuestions?: string;
  applied?: boolean;
  proposalUrl?: string;
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
  if (item.rateMin !== undefined) props["Rate Min"] = { number: item.rateMin };
  if (item.rateMax !== undefined) props["Rate Max"] = { number: item.rateMax };
  if (item.url) props["Upwork Link"] = { url: item.url };
  if (item.created) props["Created"] = { date: { start: item.created } };
  if (item.jobType) props["Job Type"] = { select: { name: item.jobType } };
  if (item.experienceLevel) props["Experience Level"] = { select: { name: item.experienceLevel } };
  if (item.projectLength) props["Project Length"] = { select: { name: item.projectLength } };
  if (item.workload) props["Workload"] = { select: { name: item.workload } };
  if (item.paymentVerified !== undefined) props["Payment Verified"] = { checkbox: item.paymentVerified };
  if (item.clientRating !== undefined) props["Client Rating"] = { number: item.clientRating };
  if (item.clientReviews !== undefined) props["Client Reviews"] = { number: item.clientReviews };
  if (item.clientSpent !== undefined) props["Client Spent"] = { number: item.clientSpent };
  if (item.clientHires !== undefined) props["Client Hires"] = { number: item.clientHires };
  if (item.applicants !== undefined) props["Applicants"] = { number: item.applicants };
  if (item.skills?.length) props["Skills"] = { multi_select: item.skills.map((name) => ({ name })) };
  if (item.preferredLocation)
    props["Preferred Location"] = { rich_text: [{ text: { content: item.preferredLocation } }] };
  if (item.locationRequired !== undefined) props["Location Required"] = { checkbox: item.locationRequired };
  if (item.enterprise !== undefined) props["Enterprise"] = { checkbox: item.enterprise };
  if (item.screeningQuestions !== undefined)
    props["Screening Questions"] = { rich_text: [{ text: { content: item.screeningQuestions.slice(0, 2000) } }] };
  if (item.applied !== undefined) props["Applied"] = { checkbox: item.applied };
  if (item.proposalUrl) props["Proposal link"] = { url: item.proposalUrl };
  return props;
}

async function findPageByExternalId(notion: Client, dbId: string, externalId: string, propName = "External ID"): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await notionRequest(notion, {
    path: `databases/${dbId}/query`,
    method: "post",
    body: { filter: { property: propName, rich_text: { equals: externalId } } },
  });
  if (resp?.results?.length) return resp.results[0].id as string;
  return null;
}

// Write a job's screening questions into its Job Feed page for the human to
// answer. Writes only the `Screening Questions` property (outside buildJobFeedProps,
// so the periodic sync never clobbers it). Returns false if no page matches.
export async function setJobScreeningQuestions(
  notion: Client,
  externalId: string,
  questionsText: string,
  opts?: { dbId?: string },
): Promise<boolean> {
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  const pageId = await findPageByExternalId(notion, dbId, externalId);
  if (!pageId) return false;
  await notionUpdate(notion, {
    page_id: pageId,
    properties: { "Screening Questions": { rich_text: [{ text: { content: questionsText.slice(0, 2000) } }] } },
  });
  return true;
}

// Read the apply inputs a human/agent filled on a job page: the bid, cover
// letter, the questions prepare wrote, and the answers. `Screening Questions` /
// `Screening Answers` are returned as raw plain text for the caller to pair.
// Returns null if no page matches.
export type JobApplyInputs = {
  bid: number | null;
  coverLetter: string;
  questionsText: string;
  answersText: string;
};
export async function readJobApplyInputs(
  notion: Client,
  externalId: string,
  opts?: { dbId?: string },
): Promise<JobApplyInputs | null> {
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await notionRequest(notion, {
    path: `databases/${dbId}/query`,
    method: "post",
    body: { filter: { property: "External ID", rich_text: { equals: externalId } } },
  });
  const page = resp?.results?.[0];
  if (!page) return null;
  const props = page.properties ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const richText = (p: any): string => (p?.rich_text ?? []).map((r: any) => r.plain_text).join("");
  return {
    bid: props["Bid"]?.number ?? null,
    coverLetter: richText(props["Cover Letter"]),
    questionsText: richText(props["Screening Questions"]),
    answersText: richText(props["Screening Answers"]),
  };
}

// Mark a job page as applied after a successful proposal submission. Returns
// false if no page matches (submission still succeeded — caller decides).
export async function markApplied(
  notion: Client,
  externalId: string,
  proposalUrl: string,
  opts?: { dbId?: string },
): Promise<boolean> {
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  const pageId = await findPageByExternalId(notion, dbId, externalId);
  if (!pageId) return false;
  await notionUpdate(notion, {
    page_id: pageId,
    properties: {
      "Applied": { checkbox: true },
      "Proposal link": { url: proposalUrl },
    },
  });
  return true;
}

// Fetch existing job-feed pages for only the External IDs seen this run, as a map
// of externalId → pageId. Prevents duplicates from Notion eventual-consistency lag
// under concurrent syncs. Queries by an `or` of the exact IDs so cost is O(run size),
// not O(total DB) — the previous full-DB scan grew unbounded (see specs/0002).
export async function fetchJobFeedPageMap(
  externalIds: string[],
  opts?: { notion?: Client; dbId?: string }
): Promise<Map<string, string>> {
  const notion = opts?.notion ?? getNotion();
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  const map = new Map<string, string>();
  if (externalIds.length === 0) return map;

  // Notion caps compound filters at 100 conditions; batch to stay under it.
  // External ID is unique, so each batch matches ≤100 rows → one page, no cursor.
  for (let i = 0; i < externalIds.length; i += 100) {
    const batch = externalIds.slice(i, i + 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await notionRequest(notion, {
      path: `databases/${dbId}/query`,
      method: "post",
      body: {
        filter: { or: batch.map(id => ({ property: "External ID", rich_text: { equals: id } })) },
        page_size: 100,
      },
    });
    for (const page of resp?.results ?? []) {
      const id: string = page.properties?.["External ID"]?.rich_text?.[0]?.plain_text;
      if (id) map.set(id, page.id);
    }
  }
  return map;
}

export async function upsertJobFeedItem(
  item: JobFeedItem,
  opts?: { notion?: Client; dbId?: string; pageMap?: Map<string, string> }
): Promise<"created" | "updated"> {
  const notion = opts?.notion ?? getNotion();
  const dbId = opts?.dbId ?? getDbId("NOTION_JOB_FEED_DATABASE_ID");
  const props = buildJobFeedProps(item);

  const existingId = opts?.pageMap?.get(item.externalId)
    ?? await findPageByExternalId(notion, dbId, item.externalId);
  if (existingId) {
    await notionUpdate(notion, { page_id: existingId, properties: props as any });
    return "updated";
  }
  await notionCreate(notion, { parent: { database_id: dbId }, properties: props as any });
  opts?.pageMap?.set(item.externalId, "pending");
  return "created";
}

// Cap the job-feed DB at `keep` rows by archiving the oldest (earliest `Created`
// published date). Queries newest-first, skips the first `keep`, and archives the
// rest — stopping once it has `max` targets, so it never rescans the whole DB.
// Archiving moves pages to Notion trash (recoverable ~30 days). Returns count archived.
export async function pruneJobFeed(
  opts: { notion: Client; dbId: string; keep: number; max: number }
): Promise<number> {
  const { notion, dbId, keep, max } = opts;
  const toArchive: string[] = [];
  let seen = 0;
  let cursor: string | undefined;
  outer: do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await notionRequest(notion, {
      path: `databases/${dbId}/query`,
      method: "post",
      body: {
        sorts: [{ property: "Created", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    for (const page of resp?.results ?? []) {
      seen++;
      if (seen > keep) {
        toArchive.push(page.id);
        if (toArchive.length >= max) break outer;
      }
    }
    cursor = resp?.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  for (const id of toArchive) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await notionUpdate(notion, { page_id: id, archived: true } as any);
  }
  return toArchive.length;
}

// ---------------------------------------------------------------------------
// Contracts DB upsert
// ---------------------------------------------------------------------------

export type ContractDayItem = {
  externalId: string;    // "contract-41815410-20260406-0900"
  weekName: string;      // "Week 15"
  contractName: string;
  date: string;          // "2026-04-06"
  rate?: number;
  minutes: number;       // integer: cells * 10
  startTime?: string;    // ISO datetime
  endTime?: string;      // ISO datetime
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContractDayProps(item: ContractDayItem): Record<string, any> {
  const props: Record<string, any> = {
    Name: { title: [{ text: { content: item.contractName } }] },
    ID: { rich_text: [{ text: { content: item.externalId } }] },
    "Week number": { rich_text: [{ text: { content: item.weekName } }] },
    Date: { date: { start: item.startTime ?? item.date, end: item.endTime ?? null } },
    Minutes: { number: item.minutes },
  };
  if (item.rate !== undefined) props.Rate = { number: item.rate };
  return props;
}

// Bulk-fetch all diary pages for a date range and return a map of externalId → pageId.
// Use this before upserting to avoid per-item Notion queries, which have eventual-consistency
// lag that causes duplicate rows when two sync runs happen within minutes of each other.
export async function fetchDiaryPageMap(
  fromDate: string,
  toDate: string,
  opts?: { notion?: Client; dbId?: string }
): Promise<Map<string, string>> {
  const notion = opts?.notion ?? getNotion();
  const dbId = opts?.dbId ?? getDbId("NOTION_DIARY_DATABASE_ID");
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await notionRequest(notion, {
      path: `databases/${dbId}/query`,
      method: "post",
      body: {
        filter: {
          and: [
            { property: "Date", date: { on_or_after: fromDate } },
            { property: "Date", date: { on_or_before: toDate } },
          ],
        },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    for (const page of resp?.results ?? []) {
      const id: string = page.properties?.ID?.rich_text?.[0]?.plain_text;
      if (id) map.set(id, page.id);
    }
    cursor = resp?.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return map;
}

export async function upsertContractDayItem(
  item: ContractDayItem,
  opts?: { notion?: Client; dbId?: string; pageMap?: Map<string, string> }
): Promise<"created" | "updated"> {
  const notion = opts?.notion ?? getNotion();
  const dbId = opts?.dbId ?? getDbId("NOTION_DIARY_DATABASE_ID");
  const props = buildContractDayProps(item);

  const existingId = opts?.pageMap?.get(item.externalId)
    ?? await findPageByExternalId(notion, dbId, item.externalId, "ID");
  if (existingId) {
    await notionUpdate(notion, { page_id: existingId, properties: props as any });
    return "updated";
  }
  await notionCreate(notion, { parent: { database_id: dbId }, properties: props as any });
  // Add to map so subsequent items in same run don't re-create
  opts?.pageMap?.set(item.externalId, "pending");
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
