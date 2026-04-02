import { z } from "zod";
import { getValidAccessToken } from "@/lib/upworkToken";

export const UpworkItem = z.object({
  externalId: z.string(),
  title: z.string(),
  stage: z.enum(["Applied", "Viewed", "Interview", "Hired"]),
  type: z.enum(["Proposal", "Offer", "Contract"]),
  client: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  url: z.string().url().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

export type UpworkItem = z.infer<typeof UpworkItem>;

// TODO: Refine this query after running /api/upwork/gql-introspect to discover the actual schema.
// The field names below are best guesses based on common Upwork GraphQL patterns.
const PROPOSALS_QUERY = `{
  proposals {
    edges {
      node {
        id
        title
        status
        type
        client { name }
        budget { amount currency }
        createdDate
        updatedDate
        jobUrl
      }
    }
  }
}`;

export function mapStatus(status: string): UpworkItem["stage"] {
  const lower = status.toLowerCase();
  if (lower.includes("hire") || lower.includes("active")) return "Hired";
  if (lower.includes("interview") || lower.includes("shortlist")) return "Interview";
  if (lower.includes("view")) return "Viewed";
  return "Applied";
}

export function mapType(type: string | undefined): UpworkItem["type"] {
  if (!type) return "Proposal";
  const lower = type.toLowerCase();
  if (lower.includes("contract")) return "Contract";
  if (lower.includes("offer")) return "Offer";
  return "Proposal";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNode(node: any): unknown {
  return {
    externalId: String(node.id ?? ""),
    title: String(node.title ?? node.name ?? "Untitled"),
    stage: mapStatus(String(node.status ?? "applied")),
    type: mapType(node.type),
    client: node.client?.name ?? node.clientName ?? undefined,
    value: typeof node.budget?.amount === "number" ? node.budget.amount : undefined,
    currency: node.budget?.currency ?? undefined,
    url: node.jobUrl ?? node.url ?? undefined,
    created: node.createdDate ?? node.createdAt ?? undefined,
    updated: node.updatedDate ?? node.updatedAt ?? undefined,
  };
}

export async function fetchUpworkItems(): Promise<UpworkItem[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("No valid Upwork access token");

  const response = await fetch("https://api.upwork.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: PROPOSALS_QUERY }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upwork GraphQL ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();

  // Navigate to the edges array — adjust path after introspection confirms the shape
  const edges =
    json?.data?.proposals?.edges ??
    json?.data?.proposals ??
    json?.proposals?.edges ??
    [];

  const items: UpworkItem[] = [];
  const nodes = Array.isArray(edges) ? edges : [];

  for (const edge of nodes) {
    const raw = edge?.node ?? edge;
    const parsed = UpworkItem.safeParse(mapNode(raw));
    if (parsed.success) {
      items.push(parsed.data);
    }
    // skip items that don't match the schema — log in future with pino
  }

  return items;
}
