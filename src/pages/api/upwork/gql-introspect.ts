import type { NextApiRequest, NextApiResponse } from "next";
import { getValidAccessToken } from "@/lib/upworkToken";
import { requireAuth } from "@/lib/requireAuth";

export const config = { runtime: "nodejs" };

const INTROSPECTION_QUERY = `{
  __schema {
    queryType { name }
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
  }
}`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAuth(req, res)) return;

  const token = await getValidAccessToken();
  if (!token) {
    return res.status(401).json({ ok: false, error: "no_token" });
  }

  const query = typeof req.body?.query === "string" ? req.body.query : INTROSPECTION_QUERY;

  const upstream = await fetch("https://api.upwork.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await upstream.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  return res.status(upstream.status).json({
    ok: upstream.ok,
    status: upstream.status,
    data: json ?? text,
  });
}
