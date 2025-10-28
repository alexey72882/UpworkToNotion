import type { NextApiRequest, NextApiResponse } from "next";
import { getValidAccessToken } from "@/lib/upworkToken";

export const config = { runtime: "nodejs" };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "use POST with {query, variables}" });
  }

  const token = await getValidAccessToken();
  if (!token) {
    return res.status(401).json({ ok: false, error: "no_token" });
  }

  const query = req.body?.query;
  const variables = req.body?.variables ?? {};

  if (!query) {
    return res.status(400).json({ ok: false, error: "missing_query" });
  }

  try {
    const upstream = await fetch("https://api.upwork.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "notion-to-upwork/1.0 (+vercel)",
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await upstream.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // leave as raw text when JSON.parse fails
    }

    return res.status(upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      contentType: upstream.headers.get("content-type") ?? "",
      data: json ?? text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
}
