import type { NextApiRequest, NextApiResponse } from "next";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { resolveUserByMcpToken } from "@/lib/mcpToken";
import { runSubmit } from "@/lib/apply";

export const config = { runtime: "nodejs" };

// MCP endpoint for a user's Notion Custom Agent. Header-based auth: the bearer is
// the user's MCP token (Option B) → resolves to a userId. The server is built
// per request with that userId bound into the tools, so tools never cross-wire
// between users. Stateless streamable-HTTP transport (Vercel serverless).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "use POST" });
  }

  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const userId = await resolveUserByMcpToken(bearer);
  if (!userId) {
    return res.status(401).json({ ok: false, error: "invalid MCP token" });
  }

  const server = new McpServer({ name: "freelancelog", version: "0.1.0" });

  server.registerTool(
    "submit_proposal",
    {
      description:
        "SUBMIT A REAL PROPOSAL to Upwork for this job. This spends Connects and cannot be undone. Reads Bid, Cover Letter, and Screening Answers from the job's Notion row — fill those in first. The row's 'Screening Questions' are pre-populated by the sync; answer them in 'Screening Answers'. Fails if the Bid or Cover Letter is empty, or if the number of Screening Answers doesn't match the questions. Input: externalId like 'job-<numeric>'.",
      inputSchema: { externalId: z.string().describe("Job External ID, e.g. 'job-2085739682157729814'") },
    },
    async ({ externalId }) => {
      const r = await runSubmit(userId, externalId);
      if (!r.ok) return { content: [{ type: "text", text: `Error: ${r.error}` }], isError: true };
      return { content: [{ type: "text", text: `Submitted. Proposal: ${r.proposalUrl}` }] };
    },
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
