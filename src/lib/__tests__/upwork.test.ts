import { describe, it, expect } from "vitest";
import { UpworkItem, mapStatus, mapType, mapNode } from "@/lib/upwork";

describe("UpworkItem Zod schema", () => {
  const valid = {
    externalId: "123",
    title: "Test job",
    stage: "Applied" as const,
    type: "Proposal" as const,
  };

  it("accepts a valid item with required fields only", () => {
    expect(UpworkItem.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid item with all optional fields", () => {
    const full = {
      ...valid,
      client: "Acme",
      value: 5000,
      currency: "USD",
      url: "https://upwork.com/job/123",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-02T00:00:00Z",
    };
    expect(UpworkItem.safeParse(full).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(UpworkItem.safeParse({}).success).toBe(false);
    expect(UpworkItem.safeParse({ externalId: "1" }).success).toBe(false);
  });

  it("rejects invalid stage", () => {
    expect(UpworkItem.safeParse({ ...valid, stage: "Nope" }).success).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(UpworkItem.safeParse({ ...valid, type: "Nope" }).success).toBe(false);
  });

  it("rejects invalid url", () => {
    expect(UpworkItem.safeParse({ ...valid, url: "not-a-url" }).success).toBe(false);
  });
});

describe("mapStatus", () => {
  it("maps active/hire to Hired", () => {
    expect(mapStatus("active")).toBe("Hired");
    expect(mapStatus("Hired")).toBe("Hired");
  });

  it("maps interview/shortlist to Interview", () => {
    expect(mapStatus("interview")).toBe("Interview");
    expect(mapStatus("shortlisted")).toBe("Interview");
  });

  it("maps viewed to Viewed", () => {
    expect(mapStatus("viewed")).toBe("Viewed");
  });

  it("defaults to Applied", () => {
    expect(mapStatus("unknown")).toBe("Applied");
    expect(mapStatus("")).toBe("Applied");
  });
});

describe("mapType", () => {
  it("maps contract", () => {
    expect(mapType("contract")).toBe("Contract");
  });

  it("maps offer", () => {
    expect(mapType("offer")).toBe("Offer");
  });

  it("defaults to Proposal", () => {
    expect(mapType("proposal")).toBe("Proposal");
    expect(mapType(undefined)).toBe("Proposal");
  });
});

describe("mapNode", () => {
  it("maps a full node to UpworkItem shape", () => {
    const node = {
      id: "abc-123",
      title: "Build a website",
      status: "active",
      type: "contract",
      client: { name: "Acme Corp" },
      budget: { amount: 3000, currency: "USD" },
      jobUrl: "https://upwork.com/job/abc",
      createdDate: "2026-01-01",
      updatedDate: "2026-01-02",
    };

    const result = mapNode(node);
    const parsed = UpworkItem.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.externalId).toBe("abc-123");
      expect(parsed.data.stage).toBe("Hired");
      expect(parsed.data.type).toBe("Contract");
      expect(parsed.data.client).toBe("Acme Corp");
      expect(parsed.data.value).toBe(3000);
    }
  });

  it("handles missing optional fields", () => {
    const node = { id: "1", title: "Job", status: "applied" };
    const result = mapNode(node);
    const parsed = UpworkItem.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("falls back to 'Untitled' when title is missing", () => {
    const node = { id: "1", status: "applied" };
    const result = mapNode(node) as Record<string, unknown>;
    expect(result.title).toBe("Untitled");
  });
});
