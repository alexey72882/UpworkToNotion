import type { NextApiRequest, NextApiResponse } from "next";

export function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  opts?: { silent?: boolean },
): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) {
    if (!opts?.silent) res.status(500).json({ ok: false, error: "API_SECRET not configured" });
    return false;
  }
  const header = req.headers.authorization;
  if (header !== `Bearer ${secret}`) {
    if (!opts?.silent) res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}
