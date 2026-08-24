import { describe, it, expect } from "vitest";
import { API_KEY_MESSAGES, messageIndexForSeq, messageForIndex } from "@/lib/apiKeyMessages";

describe("API_KEY_MESSAGES", () => {
  it("has 10 non-empty multi-line variants", () => {
    expect(API_KEY_MESSAGES).toHaveLength(10);
    for (const m of API_KEY_MESSAGES) {
      expect(m.trim().length).toBeGreaterThan(0);
      expect(m).toContain("\n");
    }
  });

  it("has no duplicates", () => {
    expect(new Set(API_KEY_MESSAGES).size).toBe(API_KEY_MESSAGES.length);
  });
});

describe("messageIndexForSeq", () => {
  it("maps claim order round-robin, wrapping at the list length", () => {
    expect(messageIndexForSeq(1)).toBe(0);
    expect(messageIndexForSeq(10)).toBe(9);
    expect(messageIndexForSeq(11)).toBe(0);
    expect(messageIndexForSeq(21)).toBe(0);
  });
});

describe("messageForIndex", () => {
  it("resolves a stored index", () => {
    expect(messageForIndex(3)).toBe(API_KEY_MESSAGES[3]);
  });

  it("is unaffected by the list growing — an assigned user keeps their text", () => {
    const grown = [...API_KEY_MESSAGES, "an 11th variant"];
    expect(grown[3]).toBe(messageForIndex(3));
  });

  it("falls back to the first variant for an unknown index", () => {
    expect(messageForIndex(99)).toBe(API_KEY_MESSAGES[0]);
  });
});
