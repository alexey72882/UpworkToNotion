import { getSupabase } from "@/lib/supabase";

// Claim a per-user callback (a pre-created `*.vercel.app` that 307s to authvault.app)
// from the `callback_domains` pool. Idempotent — returns the existing assignment if
// the user already has one. Atomic claim guarded by `is user_id null`, retried once
// on a lost race. Returns null if the pool is empty.
export async function assignCallback(userId: string): Promise<string | null> {
  const db = getSupabase();

  const { data: existing } = await db
    .from("user_settings")
    .select("upwork_redirect_uri")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.upwork_redirect_uri) return existing.upwork_redirect_uri;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: free } = await db
      .from("callback_domains")
      .select("redirect_uri")
      .is("user_id", null)
      .limit(1)
      .maybeSingle();
    if (!free) return null;

    // Conditional update — matches 0 rows if another request claimed it first.
    const { data: claimed } = await db
      .from("callback_domains")
      .update({ user_id: userId, assigned_at: new Date().toISOString() })
      .eq("redirect_uri", free.redirect_uri)
      .is("user_id", null)
      .select("redirect_uri")
      .maybeSingle();

    if (claimed?.redirect_uri) {
      await db
        .from("user_settings")
        .update({ upwork_redirect_uri: claimed.redirect_uri, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return claimed.redirect_uri;
    }
    // lost the race — retry once
  }
  return null;
}
