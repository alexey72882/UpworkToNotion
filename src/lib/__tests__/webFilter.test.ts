import { describe, it, expect } from "vitest";
import { webFilterToJobFilters } from "@/lib/webFilter";
import type { WebFilter } from "@/lib/webFilter";

const EMPTY: WebFilter = {
  skillExpression: "",
  category: "",
  subcategoryIds: [],
  jobType: [],
  minBudget: "",
  maxBudget: "",
  minFixedBudget: "",
  maxFixedBudget: "",
  experienceLevel: [],
  duration: [],
  clientHires: [],
  verifiedPaymentOnly: false,
};

describe("webFilterToJobFilters", () => {
  it("returns [] for null", () => {
    expect(webFilterToJobFilters(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(webFilterToJobFilters(undefined)).toEqual([]);
  });

  it("returns [] when all fields are empty/default", () => {
    expect(webFilterToJobFilters(EMPTY)).toEqual([]);
  });

  it("skillExpression passes through", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "React" });
    expect(f.skillExpression).toBe("React");
  });

  it("empty skillExpression becomes undefined", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
    const [f2] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x", category: "" });
    expect(f2.skillExpression).toBe("x");
    // reset to empty
    const [f3] = webFilterToJobFilters({ ...EMPTY, category: "Design & Creative" });
    expect(f3.skillExpression).toBeUndefined();
  });

  it("category becomes categoryIds array", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, category: "Design & Creative" });
    expect(f.categoryIds).toEqual(["Design & Creative"]);
  });

  it("empty category becomes undefined categoryIds", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
    expect(f.categoryIds).toBeUndefined();
  });

  it("subcategoryIds pass through", () => {
    const ids = ["Design › Product Design", "Design › Photography"];
    const [f] = webFilterToJobFilters({ ...EMPTY, category: "Design & Creative", subcategoryIds: ids });
    expect(f.subcategoryIds).toEqual(ids);
  });

  it("empty subcategoryIds becomes undefined", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, category: "Design & Creative" });
    expect(f.subcategoryIds).toBeUndefined();
  });

  describe("jobType", () => {
    it("no jobType selected → one filter with jobType undefined", () => {
      const filters = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
      expect(filters).toHaveLength(1);
      expect(filters[0].jobType).toBeUndefined();
    });

    it("Hourly selected → jobType: Hourly", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, jobType: ["Hourly"] });
      expect(f.jobType).toBe("Hourly");
    });

    it("Fixed-Price selected → jobType: Fixed", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, jobType: ["Fixed-Price"] });
      expect(f.jobType).toBe("Fixed");
    });

    it("both selected → two filters", () => {
      const filters = webFilterToJobFilters({ ...EMPTY, jobType: ["Hourly", "Fixed-Price"] });
      expect(filters).toHaveLength(2);
      expect(filters.map(f => f.jobType)).toEqual(["Hourly", "Fixed"]);
    });
  });

  describe("budget", () => {
    it("hourly budget applies when jobType is Hourly", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, jobType: ["Hourly"], minBudget: "30", maxBudget: "100" });
      expect(f.minBudget).toBe(30);
      expect(f.maxBudget).toBe(100);
    });

    it("fixed budget applies when jobType is Fixed-Price", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, jobType: ["Fixed-Price"], minFixedBudget: "500", maxFixedBudget: "2000" });
      expect(f.minBudget).toBe(500);
      expect(f.maxBudget).toBe(2000);
    });

    it("hourly budget does not apply to Fixed filter when both selected", () => {
      const filters = webFilterToJobFilters({ ...EMPTY, jobType: ["Hourly", "Fixed-Price"], minBudget: "30", maxBudget: "100", minFixedBudget: "500", maxFixedBudget: "2000" });
      const hourly = filters.find(f => f.jobType === "Hourly")!;
      const fixed = filters.find(f => f.jobType === "Fixed")!;
      expect(hourly.minBudget).toBe(30);
      expect(hourly.maxBudget).toBe(100);
      expect(fixed.minBudget).toBe(500);
      expect(fixed.maxBudget).toBe(2000);
    });

    it("empty budget strings become undefined", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, jobType: ["Hourly"] });
      expect(f.minBudget).toBeUndefined();
      expect(f.maxBudget).toBeUndefined();
    });

    it("no jobType → budgets are undefined", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x", minBudget: "30" });
      expect(f.minBudget).toBeUndefined();
      expect(f.maxBudget).toBeUndefined();
    });
  });

  describe("experienceLevel", () => {
    it("first selected value is used", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, experienceLevel: ["Expert"] });
      expect(f.experienceLevel).toBe("Expert");
    });

    it("only first value used when multiple selected", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, experienceLevel: ["Intermediate", "Expert"] });
      expect(f.experienceLevel).toBe("Intermediate");
    });

    it("empty array becomes undefined", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
      expect(f.experienceLevel).toBeUndefined();
    });
  });

  it("verifiedPaymentOnly passes through when true", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, verifiedPaymentOnly: true });
    expect(f.verifiedPaymentOnly).toBe(true);
  });

  it("verifiedPaymentOnly false becomes undefined", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
    expect(f.verifiedPaymentOnly).toBeUndefined();
  });

  it("duration passes through", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, duration: ["Week", "Month"] });
    expect(f.duration).toEqual(["Week", "Month"]);
  });

  it("empty duration becomes undefined", () => {
    const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
    expect(f.duration).toBeUndefined();
  });

  describe("clientHires", () => {
    it("empty → undefined", () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, skillExpression: "x" });
      expect(f.minClientHires).toBeUndefined();
    });

    it('"0" (no hires) → undefined (no min constraint)', () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, clientHires: ["0"] });
      expect(f.minClientHires).toBeUndefined();
    });

    it('"1" → minClientHires 1', () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, clientHires: ["1"] });
      expect(f.minClientHires).toBe(1);
    });

    it('"10" → minClientHires 10', () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, clientHires: ["10"] });
      expect(f.minClientHires).toBe(10);
    });

    it('"1" and "10" → minClientHires 1 (most inclusive)', () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, clientHires: ["1", "10"] });
      expect(f.minClientHires).toBe(1);
    });

    it('"0" and "10" → minClientHires 10 (0 excluded from min)', () => {
      const [f] = webFilterToJobFilters({ ...EMPTY, clientHires: ["0", "10"] });
      expect(f.minClientHires).toBe(10);
    });
  });
});
