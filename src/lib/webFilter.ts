import type { JobFilter } from "@/lib/notion";

export type WebFilter = {
  skillExpression: string;
  category: string;
  subcategoryIds: string[];
  jobType: string[];
  minBudget: string;
  maxBudget: string;
  minFixedBudget: string;
  maxFixedBudget: string;
  experienceLevel: string[];
  duration: string[];
  clientHires: string[];
  verifiedPaymentOnly: boolean;
};

export function webFilterToJobFilters(wf: WebFilter | null | undefined): JobFilter[] {
  if (!wf) return [];

  const hasAny =
    wf.skillExpression || wf.category || wf.subcategoryIds.length ||
    wf.jobType.length || wf.minBudget || wf.maxBudget ||
    wf.minFixedBudget || wf.maxFixedBudget || wf.experienceLevel.length ||
    wf.duration.length || wf.clientHires.length ||
    wf.verifiedPaymentOnly;
  if (!hasAny) return [];

  const jobTypes: Array<"Hourly" | "Fixed" | undefined> =
    wf.jobType.length === 0
      ? [undefined]
      : wf.jobType.map(jt => (jt === "Fixed-Price" ? "Fixed" : "Hourly"));

  const minClientHires = resolveMinClientHires(wf.clientHires);

  return jobTypes.map(jobType => ({
    name: "Web Filter",
    skillExpression: wf.skillExpression || undefined,
    categoryIds: wf.category ? [wf.category] : undefined,
    subcategoryIds: wf.subcategoryIds.length ? wf.subcategoryIds : undefined,
    jobType,
    minBudget: toNum(jobType === "Hourly" ? wf.minBudget : jobType === "Fixed" ? wf.minFixedBudget : ""),
    maxBudget: toNum(jobType === "Hourly" ? wf.maxBudget : jobType === "Fixed" ? wf.maxFixedBudget : ""),
    experienceLevel: (wf.experienceLevel[0] as JobFilter["experienceLevel"]) || undefined,
    verifiedPaymentOnly: wf.verifiedPaymentOnly || undefined,
    duration: wf.duration.length ? wf.duration : undefined,
    minClientHires,
  }));
}

function resolveMinClientHires(clientHires: string[]): number | undefined {
  const positives = clientHires.map(Number).filter(n => n > 0);
  return positives.length ? Math.min(...positives) : undefined;
}

function toNum(s: string): number | undefined {
  const n = Number(s);
  return s && !isNaN(n) ? n : undefined;
}
