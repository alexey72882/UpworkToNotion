const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID;

// Remove a pool callback's `*.vercel.app` domain from the Vercel project. Called
// on account deletion so a deleted user's callback domain is fully gone (not just
// removed from the pool). Best-effort — returns false instead of throwing so it
// never blocks account deletion. Requires a scoped VERCEL_TOKEN.
export async function deleteVercelDomain(redirectUri: string): Promise<boolean> {
  if (!TOKEN || !PROJECT) return false;
  let host: string;
  try {
    host = new URL(redirectUri).host; // e.g. gentle-falcon-1845.vercel.app
  } catch {
    return false;
  }
  const query = TEAM ? `?teamId=${TEAM}` : "";
  try {
    const r = await fetch(`https://api.vercel.com/v9/projects/${PROJECT}/domains/${host}${query}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}
