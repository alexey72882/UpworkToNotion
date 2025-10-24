import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true, service: 'UpworkToNotion', version: 'v0.1' });
}
