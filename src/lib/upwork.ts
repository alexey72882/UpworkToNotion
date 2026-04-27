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

export async function fetchUpworkItems(accessToken?: string): Promise<UpworkItem[]> {
  const token = accessToken ?? await getValidAccessToken();
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
  rateMin?: number;
  rateMax?: number;
  url?: string;
  created?: string;
  jobType?: "Hourly" | "Fixed";
  experienceLevel?: "Entry" | "Intermediate" | "Expert";
  projectLength?: string;
  workload?: string;
  paymentVerified?: boolean;
  applied: boolean;
  proposalUrl?: string;
};

const CATEGORY_ID_MAP: Record<string, string> = {
  "Web / Mobile & Software Dev": "531770282580668418",
  "Design & Creative":          "531770282580668421",
  "IT & Networking":            "531770282580668419",
  "Sales & Marketing":          "531770282580668422",
  "Data Science & Analytics":   "531770282580668420",
  "Writing":                    "531770282580668423",
  "Engineering & Architecture": "531770282584862722",
  "Accounting & Consulting":    "531770282584862721",
  "Admin Support":              "531770282580668416",
  "Customer Service":           "531770282580668417",
  "Legal":                      "531770282584862723",
  "Translation":                "531770282584862720",
};

const SUBCATEGORY_ID_MAP: Record<string, string> = {
  // Dev › ...
  "Dev › Web Development":                          "531770282584862733",
  "Dev › Web & Mobile Design":                      "531770282589057029",
  "Dev › Mobile Development":                       "531770282589057024",
  "Dev › Desktop Application Development":          "531770282589057025",
  "Dev › Ecommerce Development":                    "531770282589057026",
  "Dev › Game Design & Development":                "531770282589057027",
  "Dev › AI Apps & Integration":                    "1737190722360750082",
  "Dev › Blockchain, NFT & Cryptocurrency":         "1517518458442309632",
  "Dev › Scripts & Utilities":                      "531770282589057028",
  "Dev › Product Management & Scrum":               "531770282589057030",
  "Dev › QA Testing":                               "531770282589057031",
  "Dev › Other - Software Development":             "531770282589057032",
  // Design › ...
  "Design › Art & Illustration":                       "531770282593251335",
  "Design › Audio & Music Production":                 "531770282593251341",
  "Design › Branding & Logo Design":                   "1044578476142100480",
  "Design › NFT, AR/VR & Game Art":                    "1356688560628174848",
  "Design › Graphic, Editorial & Presentation Design": "531770282593251334",
  "Design › Performing Arts":                          "1356688565288046592",
  "Design › Photography":                              "531770282593251340",
  "Design › Product Design":                           "531770282601639953",
  "Design › Video & Animation":                        "1356688570056970240",
  // IT › ...
  "IT › Database Management & Administration":     "531770282589057033",
  "IT › ERP/CRM Software":                         "531770282589057034",
  "IT › Information Security & Compliance":        "531770282589057036",
  "IT › Network & System Administration":          "531770282589057035",
  "IT › DevOps & Solution Architecture":           "531770282589057037",
  // Marketing › ...
  "Marketing › Digital Marketing":                        "531770282597445636",
  "Marketing › Lead Generation & Telemarketing":          "531770282597445634",
  "Marketing › Marketing, PR & Brand Strategy":           "531770282593251343",
  // Data › ...
  "Data › Data Analysis & Testing":                  "531770282593251330",
  "Data › Data Extraction/ETL":                      "531770282593251331",
  "Data › Data Mining & Management":                 "531770282589057038",
  "Data › AI & Machine Learning":                    "531770282593251329",
  // Writing › ...
  "Writing › Sales & Marketing Copywriting":            "1534904462131675136",
  "Writing › Content Writing":                          "1301900640421842944",
  "Writing › Editing & Proofreading Services":          "531770282597445644",
  "Writing › Professional & Business Writing":          "531770282597445646",
  // Engineering › ...
  "Engineering › Building & Landscape Architecture":        "531770282601639949",
  "Engineering › Chemical Engineering":                     "531770282605834240",
  "Engineering › Civil & Structural Engineering":           "531770282601639950",
  "Engineering › Contract Manufacturing":                   "531770282605834241",
  "Engineering › Electrical & Electronic Engineering":      "531770282601639951",
  "Engineering › Interior & Trade Show Design":             "531770282605834242",
  "Engineering › Energy & Mechanical Engineering":          "531770282601639952",
  "Engineering › Physical Sciences":                        "1301900647896092672",
  "Engineering › 3D Modeling & CAD":                        "531770282601639948",
  // Accounting › ...
  "Accounting › Personal & Professional Coaching":         "1534904461833879552",
  "Accounting › Accounting & Bookkeeping":                 "531770282601639943",
  "Accounting › Financial Planning":                       "531770282601639945",
  "Accounting › Recruiting & Human Resources":             "531770282601639946",
  "Accounting › Management Consulting & Analysis":         "531770282601639944",
  "Accounting › Other - Accounting & Consulting":          "531770282601639947",
  // Admin › ...
  "Admin › Data Entry & Transcription Services":      "531770282584862724",
  "Admin › Virtual Assistance":                       "531770282584862725",
  "Admin › Project Management":                       "531770282584862728",
  "Admin › Market Research & Product Reviews":        "531770282584862726",
  // Support › ...
  "Support › Community Management & Tagging":           "1484275072572772352",
  "Support › Customer Service & Tech Support":          "531770282584862730",
  // Legal › ...
  "Legal › Corporate & Contract Law":                 "531770282605834246",
  "Legal › International & Immigration Law":          "1484275156546932736",
  "Legal › Finance & Tax Law":                        "531770283696353280",
  "Legal › Public Law":                               "1484275408410693632",
  // Translation › ...
  "Translation › Language Tutoring & Interpretation":       "1534904461842268160",
  "Translation › Translation & Localization Services":      "531770282601639939",
};

function buildJobFilter(filter: JobFilter): string {
  const parts: string[] = [];
  if (filter.skillExpression) parts.push(`skillExpression_eq: ${JSON.stringify(filter.skillExpression)}`);

  const catIds = (filter.categoryIds ?? []).map(n => CATEGORY_ID_MAP[n]).filter(Boolean);
  if (catIds.length) parts.push(`categoryIds_any: [${catIds.join(", ")}]`);

  const subcatIds = (filter.subcategoryIds ?? []).map(n => SUBCATEGORY_ID_MAP[n]).filter(Boolean);
  if (subcatIds.length) parts.push(`subcategoryIds_any: [${subcatIds.join(", ")}]`);

  if (filter.jobType) parts.push(`jobType_eq: ${filter.jobType.toUpperCase()}`);
  if (filter.verifiedPaymentOnly) parts.push(`verifiedPaymentOnly_eq: true`);

  if (filter.experienceLevel) {
    const lvl = filter.experienceLevel === "Entry" ? "ENTRY_LEVEL" : filter.experienceLevel.toUpperCase();
    parts.push(`experienceLevel_eq: ${lvl}`);
  }



  if (filter.maxProposals !== undefined)
    parts.push(`proposalRange_eq: { rangeEnd: ${filter.maxProposals} }`);

  if (filter.minClientHires !== undefined)
    parts.push(`clientHiresRange_eq: { rangeStart: ${filter.minClientHires} }`);

  if (filter.previousClientsOnly) parts.push(`previousClients_eq: true`);
  if (filter.enterpriseOnly) parts.push(`enterpriseOnly_eq: true`);

  return parts.join("\n    ");
}

const DURATION_KEY_TO_LABEL: Record<string, string> = {
  Week: "Less than 1 month",
  Month: "1 to 3 months",
  Quarter: "3 to 6 months",
  Semester: "More than 6 months",
  Ongoing: "Ongoing",
};



// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EXP_LEVEL_MAP: Record<string, "Entry" | "Intermediate" | "Expert"> = {
  ENTRY_LEVEL: "Entry",
  INTERMEDIATE: "Intermediate",
  EXPERT: "Expert",
};

function mapJobFeedNode(node: any): JobFeedResult {
  const fixedAmount = Number(node.amount?.rawValue ?? 0);
  const hourlyMin = Number(node.hourlyBudgetMin?.rawValue ?? 0);
  const hourlyMax = Number(node.hourlyBudgetMax?.rawValue ?? 0);
  const value = fixedAmount > 0 ? fixedAmount : undefined;
  const jobType: "Hourly" | "Fixed" | undefined =
    hourlyMax > 0 ? "Hourly" : fixedAmount > 0 ? "Fixed" : undefined;
  return {
    externalId: `job-${node.id ?? ""}`,
    title: String(node.title ?? "Untitled"),
    description: node.description ?? undefined,
    client: node.client?.location?.country ?? undefined,
    value,
    rateMin: hourlyMin > 0 ? hourlyMin : undefined,
    rateMax: hourlyMax > 0 ? hourlyMax : undefined,
    url: node.id ? `https://www.upwork.com/jobs/${node.id}` : undefined,
    created: node.publishedDateTime ?? undefined,
    jobType,
    experienceLevel: EXP_LEVEL_MAP[node.experienceLevel] ?? undefined,
    projectLength: node.durationLabel ?? undefined,
    workload: node.engagement ?? undefined,
    paymentVerified: node.client?.verificationStatus === "VERIFIED",
    applied: node.applied === true,
  };
}

export async function fetchJobFeed(filters: JobFilter[], accessToken?: string): Promise<JobFeedResult[]> {
  const token = accessToken ?? await getValidAccessToken();
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
        hourlyBudgetMin { rawValue }
        hourlyBudgetMax { rawValue }
        publishedDateTime
        experienceLevel
        durationLabel
        engagement
        client { verificationStatus location { country } }
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

    const allowedDurations = filter.duration?.length
      ? new Set(filter.duration.map(d => DURATION_KEY_TO_LABEL[d]).filter(Boolean))
      : null;

    for (const edge of edges) {
      const raw = edge?.node ?? edge;
      const mapped = mapJobFeedNode(raw);
      if (seen.has(mapped.externalId)) continue;
      if (allowedDurations && !allowedDurations.has(mapped.projectLength ?? "")) continue;
      if (mapped.jobType === "Hourly") {
        if (filter.minBudget !== undefined && (mapped.rateMax ?? 0) < filter.minBudget) continue;
        if (filter.maxBudget !== undefined && (mapped.rateMin ?? Infinity) > filter.maxBudget) continue;
      } else {
        if (filter.minBudget !== undefined && (mapped.value ?? 0) < filter.minBudget) continue;
        if (filter.maxBudget !== undefined && (mapped.value ?? Infinity) > filter.maxBudget) continue;
      }
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

export async function fetchContractDays(fromDate: string, toDate: string, accessToken?: string, personIdOverride?: string): Promise<UpworkContractDay[]> {
  const token = accessToken ?? await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const personId = personIdOverride ?? process.env.UPWORK_PERSON_ID;
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
