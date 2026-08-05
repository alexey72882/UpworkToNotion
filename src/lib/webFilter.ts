import type { JobFilter } from "@/lib/notion";

export type WebFilter = {
  skillExpression: string;
  allWords: string;
  anyWords: string;
  noneWords: string;
  exactPhrase: string;
  titleSearch: string;
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

function splitByComma(s: string): string[] {
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

function quoteIfNeeded(term: string): string {
  return term.includes(" ") ? `"${term}"` : term;
}

function composeSearchExpression(wf: WebFilter): string | undefined {
  const parts: string[] = [];
  if (wf.allWords?.trim()) parts.push(splitByComma(wf.allWords).map(quoteIfNeeded).join(" "));
  if (wf.anyWords?.trim()) parts.push(splitByComma(wf.anyWords).map(quoteIfNeeded).join(" OR "));
  if (wf.noneWords?.trim()) parts.push(splitByComma(wf.noneWords).map(t => `-${quoteIfNeeded(t)}`).join(" "));
  if (wf.exactPhrase?.trim()) parts.push(`"${wf.exactPhrase.trim()}"`);
  return parts.length ? parts.join(" ") : undefined;
}

export function webFilterToJobFilters(wf: WebFilter | null | undefined): JobFilter[] {
  if (!wf) return [];

  const hasAny =
    wf.skillExpression || wf.allWords || wf.anyWords || wf.noneWords ||
    wf.exactPhrase || wf.titleSearch || wf.category || wf.subcategoryIds.length ||
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
    skillExpression: wf.skillExpression?.trim() ? splitByComma(wf.skillExpression).join(" ") : undefined,
    searchExpression: composeSearchExpression(wf),
    titleExpression: wf.titleSearch?.trim() || undefined,
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
