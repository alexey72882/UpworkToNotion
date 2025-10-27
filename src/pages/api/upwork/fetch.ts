import type { NextApiRequest, NextApiResponse } from "next";
import { callUpwork } from "@/lib/upworkClient";

export const config = { runtime: "nodejs" };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { path = "contracts?limit=10" } = req.query;
    if (Array.isArray(path)) {
      return res.status(400).json({ ok: false, error: "bad_path_param" });
    }

    const result = await callUpwork(String(path));
    if (!result.ok) {
      return res.status(result.status ?? 502).json({
        ok: false,
        error: "upstream_failed",
        status: result.status,
        url: result.url,
        body: result.body ?? result.error,
      });
    }

    return res.status(200).json({
      ok: true,
      url: result.url,
      data: result.json,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
