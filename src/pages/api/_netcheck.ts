import type { NextApiRequest, NextApiResponse } from "next";

export const config = { runtime: "nodejs" };

async function tryFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const response = await fetch(url, init);
    return {
      url,
      ok: response.ok,
      status: response.status,
      timeMs: Date.now() - started,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return {
      url,
      ok: false,
      error: message,
      timeMs: Date.now() - started,
    };
  }
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const checks = await Promise.all([
    tryFetch("https://httpbin.org/get"),
    tryFetch("https://www.google.com"),
    tryFetch("https://www.upwork.com/api/v3/oauth2/token", { method: "HEAD" }),
  ]);

  res.status(200).json({ ok: true, checks });
}
