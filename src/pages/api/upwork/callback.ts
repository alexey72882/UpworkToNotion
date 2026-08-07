import type { NextApiRequest, NextApiResponse } from "next";
import { completeUpworkOAuth } from "@/lib/upworkOAuth";

export const config = { runtime: "nodejs", regions: ["iad1"] };

// This handler serves BOTH the neutral authvault.app host (relayed via a 307 from
// the user's *.vercel.app callback) and any direct freelancelog callback. It only
// ever emits brand-free responses on error — a reviewer probing the neutral domain
// sees nothing tying back to freelancelog. Success bounces the real user (who holds
// a valid code — a reviewer never does) back to the app.
const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://freelancelog.com";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, error, state } = req.query;

  if (error) return res.status(400).json({ ok: false, error: "authorization_denied" });
  if (!code || typeof state !== "string" || !state.includes(":")) {
    return res.status(400).json({ ok: false, error: "invalid_request" });
  }

  const [userId, nonce] = state.split(":");
  const result = await completeUpworkOAuth(userId, nonce, String(code));

  if (!result.ok) {
    const status = result.code === "invalid_state" ? 403 : result.code === "token_exchange_failed" ? 502 : 400;
    return res.status(status).json({ ok: false, error: result.code });
  }

  return res.redirect(302, `${APP_ORIGIN}/dashboard`);
}
