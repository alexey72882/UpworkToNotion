import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse<{ ok: boolean }>
) {
    res.status(200).json({ ok: true });
}