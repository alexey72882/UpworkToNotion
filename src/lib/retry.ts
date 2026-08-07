import { logger } from "@/lib/logger";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statusOf(err: any): number | undefined {
  return typeof err?.status === "number" ? err.status : undefined;
}

// Retry transient failures only: 429 (rate limited) and 5xx (server hiccup), plus
// network-level errors (fetch throws TypeError). A 4xx like 400/401/404 is a real
// problem retrying won't fix, so we surface it immediately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRetryable(err: any): boolean {
  const status = statusOf(err);
  if (status !== undefined) return status === 429 || (status >= 500 && status < 600);
  return err instanceof TypeError; // fetch network error
}

// Honor an explicit wait when the server tells us one (ms stashed on the error, or a
// Retry-After header in seconds), else fall back to exponential backoff + jitter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function waitMs(err: any, attempt: number, baseMs: number): number {
  if (typeof err?.retryAfterMs === "number") return err.retryAfterMs;
  const header = err?.headers?.["retry-after"] ?? err?.headers?.get?.("retry-after");
  const secs = header ? Number(header) : NaN;
  if (Number.isFinite(secs)) return secs * 1000;
  return baseMs * 2 ** attempt + Math.random() * baseMs;
}

// Run fn, retrying transient errors with backoff. Non-retryable errors and the final
// attempt rethrow. attempts=3 means up to 2 retries after the first try.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseMs?: number; label?: string },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 400;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isRetryable(err)) throw err;
      const ms = waitMs(err, i, baseMs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger.warn({ label: opts?.label, attempt: i + 1, status: statusOf(err as any), waitMs: Math.round(ms) }, "retrying after transient error");
      await sleep(ms);
    }
  }
}
