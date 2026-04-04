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

function buildJobFilter(filter: JobFilter): string {
  const parts: string[] = [];
  if (filter.skillExpression) parts.push(`skillExpression_eq: ${JSON.stringify(filter.skillExpression)}`);
  if (filter.categoryIds?.length) parts.push(`categoryIds_any: [${filter.categoryIds.map(id => JSON.stringify(id)).join(", ")}]`);
  if (filter.occupationIds?.length) parts.push(`occupationIds_any: [${filter.occupationIds.map(id => JSON.stringify(id)).join(", ")}]`);
  if (filter.jobType) parts.push(`jobType_eq: ${filter.jobType}`);
  if (filter.verifiedPaymentOnly) parts.push(`verifiedPaymentOnly_eq: true`);
  if (filter.experienceLevel) parts.push(`experienceLevel_eq: ${filter.experienceLevel.toUpperCase()}_LEVEL`);
  if (filter.minBudget !== undefined || filter.maxBudget !== undefined) {
    const budgetParts: string[] = [];
    if (filter.minBudget !== undefined) budgetParts.push(`min: ${filter.minBudget}`);
    if (filter.maxBudget !== undefined) budgetParts.push(`max: ${filter.maxBudget}`);
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
// Contracts
// ---------------------------------------------------------------------------

export type UpworkContract = {
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
function mapContractNode(node: any): UpworkContract {
  const hourlyRate = node.terms?.hourlyTerms?.chargeRate?.rawValue;
  const fixedAmount = node.terms?.fixedPriceTerms?.amount?.rawValue;
  const rate = hourlyRate ? Number(hourlyRate) : fixedAmount ? Number(fixedAmount) : undefined;
  const currency = node.terms?.hourlyTerms?.chargeRate?.currency
    ?? node.terms?.fixedPriceTerms?.amount?.currency
    ?? undefined;
  const contractType = hourlyRate ? "Hourly" : fixedAmount ? "Fixed" : undefined;

  return {
    externalId: `contract-${node.id ?? ""}`,
    title: String(node.title ?? "Untitled"),
    client: node.clientOrganization?.name ?? undefined,
    contractType,
    rate,
    currency,
    status: node.status ?? undefined,
    startDate: node.startDate ?? undefined,
    url: node.id ? `https://www.upwork.com/contracts/${node.id}` : undefined,
  };
}

export async function fetchContracts(): Promise<UpworkContract[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const query = `{
  contractList {
    contracts {
      id
      title
      status
      startDate
      clientOrganization { name }
      terms {
        hourlyTerms { chargeRate { rawValue currency } }
        fixedPriceTerms { amount { rawValue currency } }
      }
    }
  }
}`;

  let json;
  try {
    json = await gqlFetch(token, query);
  } catch (err) {
    logger.error({ err }, "Contracts API error");
    return [];
  }

  if (json?.errors) {
    logger.warn({ errors: json.errors }, "Contracts GraphQL errors");
    return [];
  }

  const contracts = json?.data?.contractList?.contracts ?? [];
  logger.info({ count: contracts.length }, "fetched contracts");

  return contracts
    .filter((c: any) => c.status !== "Closed")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => mapContractNode(c));
}
