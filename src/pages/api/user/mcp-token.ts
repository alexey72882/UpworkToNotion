import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabase } from "@/lib/supabase";
import { generateMcpToken } from "@/lib/mcpToken";

export const config = { runtime: "nodejs" };

// Session-authed: read or (re)generate the current user's MCP token.
// GET  -> { ok, token: string | null }
// POST -> { ok, token } (generates a new one, replacing any existing)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const db = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await db
      .from("user_settings")
      .select("mcp_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, token: data?.mcp_token ?? null });
  }

  if (req.method === "POST") {
    const token = generateMcpToken();
    const { error } = await db.from("user_settings").upsert(
      { user_id: user.id, mcp_token: token, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, token });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
