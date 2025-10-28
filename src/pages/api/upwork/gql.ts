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

  try {
    const token = await getValidAccessToken();
    if (!token) {
      return res.status(401).json({ ok: false, error: "no_token" });
    }

    const upstream = await fetch("https://www.upwork.com/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: req.body?.query,
        variables: req.body?.variables ?? {},
      }),
    });

    const text = await upstream.text();

    try {
      const json = JSON.parse(text);
      return res
        .status(upstream.ok ? 200 : upstream.status)
        .json({ ok: upstream.ok, data: json });
    } catch {
      return res
        .status(upstream.ok ? 200 : upstream.status)
        .json({ ok: upstream.ok, raw: text });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
