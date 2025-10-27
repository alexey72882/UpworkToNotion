import type { NextApiRequest, NextApiResponse } from "next";
import { callUpwork } from "@/lib/upworkClient";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

async function notionCreate(page: any) {
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(page),
  });

  const raw = await response.text();
  try {
    return {
      ok: response.ok,
      status: response.status,
      json: JSON.parse(raw),
      raw,
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      json: raw,
      raw,
    };
  }
}

function mapContractToNotion(contract: any) {
  return {
    parent: { database_id: NOTION_DB_ID },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: contract?.title ?? contract?.reference ?? "Contract",
            },
          },
        ],
      },
      Status: {
        select: { name: contract?.status ?? "unknown" },
      },
      Rate:
        typeof contract?.hourly_rate === "number"
          ? { number: Number(contract.hourly_rate) }
          : undefined,
      UpworkId: {
        rich_text: [
          {
            text: { content: String(contract?.id ?? "") },
          },
        ],
      },
    },
  };
}

export const config = { runtime: "nodejs" };

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    return res.status(500).json({ ok: false, error: "missing_notion_envs" });
  }

  const result = await callUpwork("contracts?limit=20");

  if (!result.ok) {
    return res.status(result.status ?? 502).json({
      ok: false,
      error: "upwork_fetch_failed",
      details: result,
    });
  }

  const list = Array.isArray(result.json?.contracts)
    ? result.json.contracts
    : Array.isArray(result.json?.data)
    ? result.json.data
    : Array.isArray(result.json)
    ? result.json
    : [];

  if (!Array.isArray(list)) {
    return res
      .status(502)
      .json({ ok: false, error: "unexpected_upwork_shape", sample: result.json });
  }

  const created: Array<{ id: string | undefined; status: number; ok: boolean }> = [];

  for (const contract of list) {
    const payload = mapContractToNotion(contract);
    const outcome = await notionCreate(payload);
    created.push({
      id: contract?.id,
      status: outcome.status,
      ok: outcome.ok,
    });
  }

  return res.status(200).json({
    ok: true,
    createdCount: created.length,
    created,
  });
}
