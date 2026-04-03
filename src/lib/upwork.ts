import { z } from "zod";
import { getValidAccessToken } from "@/lib/upworkToken";
import { logger } from "@/lib/logger";

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

// Fetches the last 10 jobs from the Upwork job search feed (no keyword filter).
export async function fetchJobFeed(): Promise<UpworkItem[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const query = `{
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: {}
    searchType: USER_JOBS_SEARCH
  ) {
    edges {
      node {
        id
        title
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
    logger.error({ err }, "Job feed API error");
    return [];
  }

  if (json?.errors) {
    logger.warn({ errors: json.errors }, "Job feed GraphQL errors");
    return [];
  }

  const edges = json?.data?.marketplaceJobPostingsSearch?.edges ?? [];
  logger.info({ edgeCount: edges.length }, "fetched job feed");

  const items: UpworkItem[] = [];
  for (const edge of edges) {
    const raw = edge?.node ?? edge;
    const mapped = mapJobNode(raw);
    if (!mapped) continue;
    const parsed = UpworkItem.safeParse(mapped);
    if (parsed.success) items.push(parsed.data);
  }

  return items;
}
