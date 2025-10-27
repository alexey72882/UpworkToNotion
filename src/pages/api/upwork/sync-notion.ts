import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "@notionhq/client";
import { getValidAccessToken } from "@/lib/upworkToken";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

const notion = NOTION_TOKEN ? new Client({ auth: NOTION_TOKEN }) : null;

function buildProperties(contract: any) {
  const props: Record<string, any> = {
    Name: {
      title: [
        {
          text: {
            content: contract?.title ?? contract?.reference ?? "Untitled Contract",
          },
        },
      ],
    },
  };

  if (contract?.status) {
    props.Status = {
      select: {
        name: String(contract.status),
      },
    };
  }

  const hourlyRate = contract?.hourly_rate;
  if (typeof hourlyRate === "number") {
    props.Rate = { number: hourlyRate };
  }

  return props;
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (!NOTION_TOKEN || !NOTION_DB_ID || !notion) {
      return res
        .status(500)
        .json({ ok: false, error: "Missing NOTION_TOKEN or NOTION_DB_ID" });
    }

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

    const payload = await response.json();
    const items: any[] =
      payload?.results ??
      payload?.contracts ??
      payload?.items ??
      payload ??
      [];

    let created = 0;
    for (const contract of items) {
      await notion.pages.create({
        parent: { database_id: NOTION_DB_ID },
        properties: buildProperties(contract),
      });
      created += 1;
    }

    return res.status(200).json({ ok: true, created });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
