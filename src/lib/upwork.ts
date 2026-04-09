import { z } from "zod";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";
import type { JobFilter } from "@/lib/notion";

export const UpworkItem = z.object({
  externalId: z.string(),
  title: z.string(),
  stage: z.enum(["Applied", "Viewed", "Interview", "Hired", "Lead"]),
  type: z.enum(["Proposal", "Offer", "Contract"]),
  client: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  url: z.string().url().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

export type UpworkItem = z.infer<typeof UpworkItem>;

// vendorProposals accepts at most 40 items per page
const PAGE_SIZE = 10;

// Active statuses only — covers current open proposals and recent hires
const PROPOSAL_STATUSES = [
  "Pending",
  "Activated",
  "Accepted",
  "Offered",
  "Hired",
] as const;

export function mapStatus(status: string): UpworkItem["stage"] {
  switch (status) {
    case "Hired":
    case "Accepted":
    case "Activated":
      return "Hired";
    case "Offered":
      return "Interview";
    case "Declined":
    case "Withdrawn":
    case "Archived":
      return "Viewed";
    default:
      return "Applied";
  }
}

export function mapType(status: string): UpworkItem["type"] {
  switch (status) {
    case "Hired":
    case "Accepted":
    case "Activated":
      return "Contract";
    case "Offered":
      return "Offer";
    default:
      return "Proposal";
  }
}

function epochMsToIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const ms = Number(raw);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNode(node: any): unknown {
  const status = node.status?.status ?? "Pending";
  return {
    externalId: String(node.id ?? ""),
    title: String(node.marketplaceJobPosting?.content?.title ?? "Untitled"),
    stage: mapStatus(status),
    type: mapType(status),
    client: node.organization?.name ?? undefined,
    value: node.terms?.chargeRate?.rawValue
      ? Number(node.terms.chargeRate.rawValue)
      : undefined,
    currency: node.terms?.chargeRate?.currency ?? undefined,
    url: node.marketplaceJobPosting?.id
      ? `https://www.upwork.com/jobs/${node.marketplaceJobPosting.id}`
      : undefined,
    created: epochMsToIso(node.auditDetails?.createdDateTime?.rawValue),
    updated: epochMsToIso(node.auditDetails?.modifiedDateTime?.rawValue),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapJobNode(node: any): unknown | null {
  if (node.applied === true) return null;
  const fixedAmount = Number(node.amount?.rawValue ?? 0);
  const hourlyMax = Number(node.hourlyBudgetMax?.rawValue ?? 0);
  const value = fixedAmount > 0 ? fixedAmount : hourlyMax > 0 ? hourlyMax : undefined;
  const currency = node.amount?.currency ?? undefined;
  return {
    externalId: `job-${node.id ?? ""}`,
    title: String(node.title ?? "Untitled"),
    stage: "Lead" as const,
    type: "Proposal" as const,
    client: node.client?.location?.country ?? undefined,
    value: value,
    currency: currency,
    url: node.id ? `https://www.upwork.com/jobs/${node.id}` : undefined,
    created: node.publishedDateTime ?? undefined,
    updated: undefined,
  };
}

async function gqlFetch(token: string, query: string) {
  const response = await fetch("https://api.upwork.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "notion-to-upwork/1.0 (+vercel)",
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Upwork GraphQL HTTP ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function fetchUpworkItems(): Promise<UpworkItem[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const items: UpworkItem[] = [];

  for (const status of PROPOSAL_STATUSES) {
    const query = `{
  vendorProposals(
    filter: { status_eq: ${status} }
    sortAttribute: { field: CREATEDDATETIME, sortOrder: DESC }
    pagination: { first: ${PAGE_SIZE} }
  ) {
    edges {
      node {
        id
        status { status }
        marketplaceJobPosting {
          id
          content { title }
        }
        organization { name }
        terms {
          chargeRate { rawValue currency }
        }
        auditDetails {
          createdDateTime { rawValue }
          modifiedDateTime { rawValue }
        }
      }
    }
  }
}`;

    let json;
    try {
      json = await gqlFetch(token, query);
    } catch (err) {
      logger.error({ status, err }, "Upwork API error, skipping status");
      continue;
    }

    if (json?.errors) {
      logger.warn({ status, errors: json.errors }, "GraphQL errors, skipping status");
      continue;
    }

    const edges = json?.data?.vendorProposals?.edges ?? [];
    logger.info({ status, edgeCount: edges.length }, "fetched proposals");

    for (const edge of edges) {
      const raw = edge?.node ?? edge;
      const parsed = UpworkItem.safeParse(mapNode(raw));
      if (parsed.success) {
        items.push(parsed.data);
      } else {
        logger.warn({ status, id: raw?.id, errors: parsed.error.issues }, "zod validation failed");
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Job feed — reads filters from Notion, fetches matching jobs
// ---------------------------------------------------------------------------

export type JobFeedResult = {
  externalId: string;
  title: string;
  description?: string;
  client?: string;
  value?: number;
  currency?: string;
  url?: string;
  created?: string;
};

// Maps Notion "Hourly"/"Fixed" select values to Upwork enum
function toContractTypeEnum(val: string): string {
  return val.toUpperCase(); // "Hourly" → "HOURLY", "Fixed" → "FIXED"
}

// Maps Notion experience level to Upwork enum: "Expert" → "EXPERT", "Intermediate" → "INTERMEDIATE", "Entry" → "ENTRY_LEVEL"
function toExperienceEnum(val: string): string {
  if (val === "Entry") return "ENTRY_LEVEL";
  return val.toUpperCase();
}

function buildJobFilter(filter: JobFilter): string {
  const parts: string[] = [];
  if (filter.skillExpression) parts.push(`skillExpression_eq: ${JSON.stringify(filter.skillExpression)}`);
  // categoryIds/occupationIds must be numeric — skip text values like category names
  const numericCatIds = (filter.categoryIds ?? []).filter(id => /^\d+$/.test(id));
  if (numericCatIds.length) parts.push(`categoryIds_any: [${numericCatIds.join(", ")}]`);
  const numericOccIds = (filter.occupationIds ?? []).filter(id => /^\d+$/.test(id));
  if (numericOccIds.length) parts.push(`occupationIds_any: [${numericOccIds.join(", ")}]`);
  if (filter.jobType) parts.push(`jobType_eq: ${toContractTypeEnum(filter.jobType)}`);
  if (filter.verifiedPaymentOnly) parts.push(`verifiedPaymentOnly_eq: true`);
  if (filter.experienceLevel) parts.push(`experienceLevel_eq: ${toExperienceEnum(filter.experienceLevel)}`);
  if (filter.minBudget !== undefined || filter.maxBudget !== undefined) {
    const budgetParts: string[] = [];
    if (filter.minBudget !== undefined) budgetParts.push(`rangeStart: ${filter.minBudget}`);
    if (filter.maxBudget !== undefined) budgetParts.push(`rangeEnd: ${filter.maxBudget}`);
    parts.push(`budgetRange_eq: { ${budgetParts.join(", ")} }`);
  }
  return parts.join("\n    ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobFeedNode(node: any): JobFeedResult | null {
  if (node.applied === true) return null;
  const fixedAmount = Number(node.amount?.rawValue ?? 0);
  const hourlyMax = Number(node.hourlyBudgetMax?.rawValue ?? 0);
  const value = fixedAmount > 0 ? fixedAmount : hourlyMax > 0 ? hourlyMax : undefined;
  return {
    externalId: `job-${node.id ?? ""}`,
    title: String(node.title ?? "Untitled"),
    description: node.description ?? undefined,
    client: node.client?.location?.country ?? undefined,
    value,
    currency: node.amount?.currency ?? undefined,
    url: node.id ? `https://www.upwork.com/jobs/${node.id}` : undefined,
    created: node.publishedDateTime ?? undefined,
  };
}

export async function fetchJobFeed(filters: JobFilter[]): Promise<JobFeedResult[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  if (filters.length === 0) {
    logger.info("no active job filters, skipping job feed");
    return [];
  }

  const seen = new Set<string>();
  const items: JobFeedResult[] = [];

  for (const filter of filters) {
    const filterStr = buildJobFilter(filter);
    const query = `{
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: { ${filterStr} }
    searchType: USER_JOBS_SEARCH
  ) {
    edges {
      node {
        id
        title
        description
        amount { rawValue currency }
        hourlyBudgetMax { rawValue }
        publishedDateTime
        client { location { country } }
        applied
      }
    }
  }
}`;

    let json;
    try {
      json = await gqlFetch(token, query);
    } catch (err) {
      logger.error({ filter: filter.name, err }, "Job feed API error, skipping filter");
      continue;
    }

    if (json?.errors) {
      logger.warn({ filter: filter.name, errors: json.errors }, "Job feed GraphQL errors, skipping filter");
      continue;
    }

    const edges = json?.data?.marketplaceJobPostingsSearch?.edges ?? [];
    logger.info({ filter: filter.name, edgeCount: edges.length }, "fetched jobs for filter");

    for (const edge of edges) {
      const raw = edge?.node ?? edge;
      const mapped = mapJobFeedNode(raw);
      if (!mapped || seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);
      items.push(mapped);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Contracts — per-day hours with batched GraphQL
// ---------------------------------------------------------------------------

export type UpworkContractDay = {
  externalId: string;    // "contract-41815410-20260406"
  weekName: string;      // "Week 15"
  contractName: string;
  date: string;          // "2026-04-06"
  rate?: number;
  minutes: number;       // integer: cells * 10
};

export function getCurrentWeekRange(): { rangeStart: string; rangeEnd: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { rangeStart: fmt(monday), rangeEnd: fmt(now) };
}

function yyyymmddToIso(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function getISOWeek(isoDate: string): number {
  const d = new Date(isoDate);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const DIARY_BATCH_SIZE = 10;

export async function fetchContractDays(fromDate: string, toDate: string): Promise<UpworkContractDay[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const personId = process.env.UPWORK_PERSON_ID;
  if (!personId) {
    logger.info("UPWORK_PERSON_ID not set, skipping contracts");
    return [];
  }

  // Step 1: Get active contracts with rates (1 request)
  const historyJson = await gqlFetch(token, `{
    talentWorkHistory(filter: { personId: "${personId}", status: [ACTIVE] }) {
      workHistoryList { contract { id title terms { hourlyRate fixedAmount } } }
    }
  }`);

  if (historyJson?.errors) {
    logger.warn({ errors: historyJson.errors }, "talentWorkHistory errors");
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workHistoryList: any[] = historyJson?.data?.talentWorkHistory?.workHistoryList ?? [];
  if (workHistoryList.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = workHistoryList.map(({ contract }: any) => {
    const rawRate = contract?.terms?.hourlyRate ?? contract?.terms?.fixedAmount;
    return {
      id: String(contract.id),
      title: String(contract.title ?? "Untitled"),
      rate: rawRate ? Number(rawRate) : undefined,
    };
  });
  logger.info({ count: contracts.length }, "fetched active contracts");

  // Step 2: All workDays queries in 1 batched request
  const workDaysQuery = `{
    ${contracts.map(c =>
      `c${c.id}: workDays(workdaysInput: { contractIds: ["${c.id}"], timeRange: { rangeStart: "${fromDate}", rangeEnd: "${toDate}" } }) { workDays }`
    ).join("\n    ")}
  }`;
  const workDaysJson = await gqlFetch(token, workDaysQuery);

  // Collect all (contractId, date) pairs
  const pairs: Array<{ contractId: string; date: string }> = [];
  for (const c of contracts) {
    const days: string[] = workDaysJson?.data?.[`c${c.id}`]?.workDays ?? [];
    for (const day of days) pairs.push({ contractId: c.id, date: day });
  }
  logger.info({ pairCount: pairs.length }, "contract-day pairs to fetch");

  if (pairs.length === 0) return [];

  // Step 3: Batch diary queries in groups of DIARY_BATCH_SIZE
  const cellCounts: Record<string, number> = {};
  for (let i = 0; i < pairs.length; i += DIARY_BATCH_SIZE) {
    const batch = pairs.slice(i, i + DIARY_BATCH_SIZE);
    const diaryQuery = `{
      ${batch.map(({ contractId, date }) =>
        `d${contractId}_${date}: workDiaryContract(workDiaryContractInput: { contractId: "${contractId}", date: "${date}" }) { workDiaryTimeCells { cellDateTime { rawValue } } }`
      ).join("\n      ")}
    }`;
    try {
      const diaryJson = await gqlFetch(token, diaryQuery);
      if (diaryJson?.errors) logger.warn({ errors: diaryJson.errors }, "diary batch had GraphQL errors");
      for (const { contractId, date } of batch) {
        const cells = diaryJson?.data?.[`d${contractId}_${date}`]?.workDiaryTimeCells ?? [];
        cellCounts[`${contractId}-${date}`] = cells.length;
      }
    } catch (err) {
      logger.error({ batchIndex: i, err }, "diary batch failed, skipping");
    }
    logger.info({ batch: Math.floor(i / DIARY_BATCH_SIZE) + 1, total: Math.ceil(pairs.length / DIARY_BATCH_SIZE) }, "diary batch done");
  }

  // Build results
  const results: UpworkContractDay[] = [];
  for (const c of contracts) {
    const days: string[] = workDaysJson?.data?.[`c${c.id}`]?.workDays ?? [];
    for (const day of days) {
      const cells = cellCounts[`${c.id}-${day}`] ?? 0;
      const isoDate = yyyymmddToIso(day);
      results.push({
        externalId: `contract-${c.id}-${day}`,
        weekName: `Week ${getISOWeek(isoDate)}`,
        contractName: c.title,
        date: isoDate,
        rate: c.rate,
        minutes: cells * 10,
      });
    }
  }

  return results;
}
