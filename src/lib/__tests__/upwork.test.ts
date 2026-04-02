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
  it("maps Hired/Accepted/Activated to Hired", () => {
    expect(mapStatus("Hired")).toBe("Hired");
    expect(mapStatus("Accepted")).toBe("Hired");
    expect(mapStatus("Activated")).toBe("Hired");
  });

  it("maps Offered to Interview", () => {
    expect(mapStatus("Offered")).toBe("Interview");
  });

  it("maps Declined/Withdrawn/Archived to Viewed", () => {
    expect(mapStatus("Declined")).toBe("Viewed");
    expect(mapStatus("Withdrawn")).toBe("Viewed");
    expect(mapStatus("Archived")).toBe("Viewed");
  });

  it("defaults to Applied", () => {
    expect(mapStatus("Pending")).toBe("Applied");
    expect(mapStatus("unknown")).toBe("Applied");
  });
});

describe("mapType", () => {
  it("maps Hired/Accepted/Activated to Contract", () => {
    expect(mapType("Hired")).toBe("Contract");
    expect(mapType("Accepted")).toBe("Contract");
    expect(mapType("Activated")).toBe("Contract");
  });

  it("maps Offered to Offer", () => {
    expect(mapType("Offered")).toBe("Offer");
  });

  it("defaults to Proposal", () => {
    expect(mapType("Pending")).toBe("Proposal");
    expect(mapType("Declined")).toBe("Proposal");
  });
});

describe("mapNode", () => {
  it("maps a full Upwork GraphQL node to UpworkItem shape", () => {
    const node = {
      id: "abc-123",
      status: { status: "Activated" },
      marketplaceJobPosting: {
        id: "job-456",
        content: { title: "Build a website" },
      },
      organization: { name: "Acme Corp" },
      terms: {
        chargeRate: { rawValue: "65", currency: "USD" },
      },
      auditDetails: {
        createdDateTime: { rawValue: "1700000000000" },
        modifiedDateTime: { rawValue: "1700100000000" },
      },
    };

    const result = mapNode(node);
    const parsed = UpworkItem.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.externalId).toBe("abc-123");
      expect(parsed.data.title).toBe("Build a website");
      expect(parsed.data.stage).toBe("Hired");
      expect(parsed.data.type).toBe("Contract");
      expect(parsed.data.client).toBe("Acme Corp");
      expect(parsed.data.value).toBe(65);
      expect(parsed.data.currency).toBe("USD");
      expect(parsed.data.url).toBe("https://www.upwork.com/jobs/job-456");
      expect(parsed.data.created).toBe("2023-11-14T22:13:20.000Z");
    }
  });

  it("handles missing optional fields", () => {
    const node = {
      id: "1",
      status: { status: "Pending" },
      marketplaceJobPosting: { content: { title: "Job" } },
    };
    const result = mapNode(node);
    const parsed = UpworkItem.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("falls back to 'Untitled' when title is missing", () => {
    const node = { id: "1", status: { status: "Pending" } };
    const result = mapNode(node) as Record<string, unknown>;
    expect(result.title).toBe("Untitled");
  });
});
