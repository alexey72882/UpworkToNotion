import { describe, it, expect } from "vitest";
import { buildProps, type NotionItem } from "@/lib/notion";

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
