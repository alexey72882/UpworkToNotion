import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/retry";

const fast = { baseMs: 1 };

function statusError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe("withRetry", () => {
  it("returns the result without retrying on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(statusError(429))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(statusError(503))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx (except 429) and throws immediately", async () => {
    const fn = vi.fn().mockRejectedValue(statusError(400));
    await expect(withRetry(fn, fast)).rejects.toThrow("HTTP 400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries network errors (TypeError)", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after `attempts` and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(statusError(500));
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toThrow("HTTP 500");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("honors an explicit retryAfterMs from the error", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429, retryAfterMs: 20 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const start = Date.now();
    await withRetry(fn, fast);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});
