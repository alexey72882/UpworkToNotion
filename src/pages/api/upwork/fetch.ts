import type { NextApiRequest, NextApiResponse } from "next";
import { getValidAccessToken } from "@/lib/upworkToken";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const access = await getValidAccessToken();
    if (!access) {
      return res.status(401).json({ ok: false, error: "no_token" });
    }

    const response = await fetch("https://www.upwork.com/api/v3/contracts", {
      headers: {
        Authorization: `Bearer ${access}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return res
        .status(response.status)
        .json({ ok: false, error: "upwork_error", status: response.status, body });
    }

    const data = await response.json();
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
