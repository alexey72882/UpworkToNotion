import { randomBytes } from "node:crypto";
import { getSupabase } from "@/lib/supabase";

// Per-user MCP token: the bearer the user pastes into their Notion Custom Agent
// connection. Maps 1:1 to a user_settings row so the MCP endpoint resolves which
// user's Upwork/Notion to act on (Option B identity).

export function generateMcpToken(): string {
  return "flog_" + randomBytes(24).toString("hex");
}

export async function resolveUserByMcpToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await getSupabase()
    .from("user_settings")
    .select("user_id")
    .eq("mcp_token", token)
    .maybeSingle();
  return data?.user_id ?? null;
}
