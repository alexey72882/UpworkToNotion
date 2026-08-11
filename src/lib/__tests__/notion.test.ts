import { describe, it, expect, vi } from "vitest";
import { buildProps, fetchJobFeedPageMap, type NotionItem } from "@/lib/notion";

type QueryResp = { results: unknown[]; has_more: boolean; next_cursor?: string };

function page(externalId: string, id: string, created: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    created_time: created,
    properties: { "External ID": { rich_text: [{ plain_text: externalId }] }, ...extra },
  };
}

describe("fetchJobFeedPageMap", () => {
  it("pages through filtered results past the 100-row limit", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ results: [page("job-1", "p1", "2026-01-01T00:00:00Z")], has_more: true, next_cursor: "c1" } as QueryResp)
      .mockResolvedValueOnce({ results: [page("job-2", "p2", "2026-01-01T00:00:00Z")], has_more: false } as QueryResp);
    const update = vi.fn().mockResolvedValue({});
    const notion = { request, pages: { update } } as never;

    const map = await fetchJobFeedPageMap(["job-1", "job-2"], { notion, dbId: "db" });

    expect(request).toHaveBeenCalledTimes(2); // followed the cursor
    expect(map.get("job-1")).toBe("p1");
    expect(map.get("job-2")).toBe("p2");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps the earliest-created page and archives duplicates when none are filled", async () => {
    const request = vi.fn().mockResolvedValue({
      results: [
        page("job-1", "newer", "2026-01-02T00:00:00Z"),
        page("job-1", "oldest", "2026-01-01T00:00:00Z"),
        page("job-1", "middle", "2026-01-01T12:00:00Z"),
      ],
      has_more: false,
    } as QueryResp);
    const update = vi.fn().mockResolvedValue({});
    const notion = { request, pages: { update } } as never;

    const map = await fetchJobFeedPageMap(["job-1"], { notion, dbId: "db" });

    expect(map.get("job-1")).toBe("oldest"); // survivor is earliest created
    const archived = update.mock.calls.map((c) => c[0]);
    expect(archived).toEqual(
      expect.arrayContaining([
        { page_id: "newer", archived: true },
        { page_id: "middle", archived: true },
      ]),
    );
    expect(update).toHaveBeenCalledTimes(2); // only the two extras
  });

  it("keeps the copy with the most apply-data, not the earliest", async () => {
    const request = vi.fn().mockResolvedValue({
      results: [
        page("job-1", "earliest-empty", "2026-01-01T00:00:00Z"),
        page("job-1", "later-filled", "2026-01-02T00:00:00Z", {
          Applied: { checkbox: true },
          "Cover Letter": { rich_text: [{ plain_text: "my letter" }] },
          Bid: { number: 60 },
        }),
      ],
      has_more: false,
    } as QueryResp);
    const update = vi.fn().mockResolvedValue({});
    const notion = { request, pages: { update } } as never;

    const map = await fetchJobFeedPageMap(["job-1"], { notion, dbId: "db" });

    expect(map.get("job-1")).toBe("later-filled"); // richest survives despite being newer
    expect(update).toHaveBeenCalledWith({ page_id: "earliest-empty", archived: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("buildProps", () => {
  const full: NotionItem = {
    externalId: "ext-1",
    title: "Full item",
    stage: "Interview",
    type: "Offer",
    client: "Acme",
    value: 2500,
    currency: "EUR",
    url: "https://upwork.com/job/1",
    created: "2026-01-01",
    updated: "2026-01-02",
  };

  it("maps all fields for a full item", () => {
    const props = buildProps(full);

    expect(props.Name).toEqual({ title: [{ text: { content: "Full item" } }] });
    expect(props.Stage).toEqual({ select: { name: "Interview" } });
    expect(props.Type).toEqual({ select: { name: "Offer" } });
    expect(props["External ID"]).toEqual({
      rich_text: [{ text: { content: "ext-1" } }],
    });
    expect(props.Client).toEqual({
      rich_text: [{ text: { content: "Acme" } }],
    });
    expect(props.Value).toEqual({ number: 2500 });
    expect(props.Currency).toEqual({ select: { name: "EUR" } });
    expect(props["Upwork Link"]).toEqual({ url: "https://upwork.com/job/1" });
    expect(props.Created).toEqual({ date: { start: "2026-01-01" } });
    expect(props.Updated).toEqual({ date: { start: "2026-01-02" } });
  });

  it("omits optional fields when undefined", () => {
    const minimal: NotionItem = {
      externalId: "ext-2",
      title: "Minimal",
      stage: "Applied",
      type: "Proposal",
    };

    const props = buildProps(minimal);

    expect(props.Name).toBeDefined();
    expect(props.Stage).toBeDefined();
    expect(props.Type).toBeDefined();
    expect(props["External ID"]).toBeDefined();
    expect(props.Client).toBeUndefined();
    expect(props.Value).toBeUndefined();
    expect(props.Currency).toBeUndefined();
    expect(props["Upwork Link"]).toBeUndefined();
    expect(props.Created).toBeUndefined();
    expect(props.Updated).toBeUndefined();
  });

  it("includes value of 0", () => {
    const item: NotionItem = {
      externalId: "ext-3",
      title: "Zero value",
      stage: "Applied",
      type: "Proposal",
      value: 0,
    };

    const props = buildProps(item);
    expect(props.Value).toEqual({ number: 0 });
  });
});
