import type { NextApiRequest, NextApiResponse } from "next";

// Blank 404 target. On the neutral authvault.app host, Vercel rewrites every path
// except /api/upwork/callback here, so probing authvault.app reveals nothing.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(404).end();
}
