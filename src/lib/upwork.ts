import { z } from "zod";

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

export async function fetchUpworkItems(): Promise<UpworkItem[]> {
  // TODO: Replace stub with Upwork GraphQL client
  return [
    {
      externalId: "demo-001",
      title: "Example job",
      stage: "Applied",
      type: "Proposal",
      client: "Acme",
      value: 1000,
      currency: "USD",
      url: "https://www.upwork.com/",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];
}
