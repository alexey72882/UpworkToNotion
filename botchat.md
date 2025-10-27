### [2025-10-26 | @chatgpt → @codex]
```md
### [@chatgpt → @codex] Implement Upwork OAuth callback + deploy

**Goal:** Fix the 404 on `/api/upwork/callback` and complete OAuth flow.

---

#### 1) Create file: `src/pages/api/upwork/callback.ts`
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, error } = req.query;

  if (error) return res.status(400).json({ ok: false, error });
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const client_id = process.env.UPWORK_CLIENT_ID!;
  const client_secret = process.env.UPWORK_CLIENT_SECRET!;
  const redirect_uri = process.env.UPWORK_REDIRECT_URI!; // must equal Vercel env: https://notion-to-upwork.vercel.app/api/upwork/callback

  if (!client_id || !client_secret || !redirect_uri) {
    return res.status(500).json({ ok: false, error: "Missing UPWORK_* envs" });
  }

  const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri,
    }),
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    return res.status(502).json({ ok: false, error: data });
  }

  // TODO: persist tokens (access_token, refresh_token, expires_in) to Supabase
  // For now, return them so we can verify the flow end-to-end.
  return res.status(200).json({ ok: true, source: "callback", tokens: data });
}
```

### [2025-10-26 | @chatgpt → @codex]
```md
### [@chatgpt → @codex] Persist Upwork tokens in Supabase + auto‑refresh (one‑click)

**Goal:** Save tokens returned by `/api/upwork/callback` into Supabase, auto‑refresh them before expiry, and always use a valid access token from the store.

---

#### 0) Prereqs (already present ✅)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel envs
- `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET`, `UPWORK_REDIRECT_URI`, `UPWORK_SCOPES`

---

#### 1) Supabase table (create once)
Run this SQL in your Supabase project (SQL Editor → Run):

```sql
create table if not exists upwork_tokens (
  id text primary key default 'singleton',
  access_token text not null,
  refresh_token text not null,
  -- epoch millis when the access_token expires
  expires_at bigint not null,
  scope text,
  updated_at timestamptz not null default now()
);

-- allow service role to upsert (we use the service role key server‑side only)
-- (adjust policies if you later add RLS; for now table can stay without RLS)
```

---

#### 2) Add helper: `src/lib/supabase.ts`
```ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
```

---

#### 3) Add helper: `src/lib/upworkToken.ts`
```ts
import { supabase } from './supabase';

export type TokenPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
};

const TABLE = 'upwork_tokens';
const ROW_ID = 'singleton';

export async function saveTokens(t: TokenPayload) {
  const expires_at = Date.now() + (t.expires_in * 1000);
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      id: ROW_ID,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at,
      scope: t.scope ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw error;
}

export async function getTokens() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data as { access_token: string; refresh_token: string; expires_at: number; scope?: string } | null;
}

async function refreshWithUpwork(refresh_token: string) {
  const client_id = process.env.UPWORK_CLIENT_ID!;
  const client_secret = process.env.UPWORK_CLIENT_SECRET!;
  const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  const res = await fetch('https://www.upwork.com/api/v3/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(json)}`);
  return json as TokenPayload;
}

export async function getValidAccessToken() {
  const row = await getTokens();
  if (!row) return null;
  const now = Date.now();
  // refresh 2 minutes early to avoid races
  if (row.expires_at - now < 120_000) {
    const refreshed = await refreshWithUpwork(row.refresh_token);
    await saveTokens(refreshed);
    return refreshed.access_token;
  }
  return row.access_token;
}
```

---

#### 4) Update callback to persist tokens
Edit `src/pages/api/upwork/callback.ts` and replace the success return with a save:

```ts
// after obtaining `data` from Upwork
import { saveTokens } from '@/lib/upworkToken';

// ...inside handler, after `if (!tokenRes.ok)`:
await saveTokens({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_in: data.expires_in,
  scope: data.scope,
});

return res.status(200).json({ ok: true, source: 'callback', saved: true });
```

---

#### 5) Commit & push
```bash
git add supabase.sql src/lib/supabase.ts src/lib/upworkToken.ts src/pages/api/upwork/callback.ts
git commit -m "feat(oauth): persist Upwork tokens to Supabase + auto‑refresh"
git push origin main
```

---

#### 6) Verify in production
```bash
# 6.1 Auth is still a redirect
curl -sI https://notion-to-upwork.vercel.app/api/upwork/auth | head -n 1  # expect HTTP/2 302

# 6.2 Complete the browser flow (approve Upwork). Callback should return { ok: true, saved: true }.
open "https://notion-to-upwork.vercel.app/api/upwork/auth" || xdg-open "https://notion-to-upwork.vercel.app/api/upwork/auth"

# 6.3 Quick API sanity checks
curl -s https://notion-to-upwork.vercel.app/api/notion-debug
curl -s https://notion-to-upwork.vercel.app/api/sync
```

---

#### 7) (Optional) Use the token from anywhere
```ts
import { getValidAccessToken } from '@/lib/upworkToken';

export async function callUpwork(path: string) {
  const access = await getValidAccessToken();
  if (!access) throw new Error('No Upwork token found');
  const r = await fetch(`https://www.upwork.com/api/${path}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  return r.json();
}
```

---

#### 8) Report back in this log
```
### [YYYY-MM-DD | @codex-report]
Tokens table: <created/exists>
Callback: <status body>
Auto‑refresh smoke test: <passed/failed>
Outcome: <success | error + note>
```
```

---

#### 2) Commit & push (triggers Vercel build)
```bash
git add src/pages/api/upwork/callback.ts
git commit -m "feat(oauth): add Upwork OAuth callback endpoint"
git push origin main
```

---

#### 3) Post-deploy verification (prod)
```bash
# Should be 302 Found
curl -sI https://notion-to-upwork.vercel.app/api/upwork/auth | head -n 1

# Complete the browser flow:
# 1) Open the auth URL:
#    https://notion-to-upwork.vercel.app/api/upwork/auth
# 2) Approve in Upwork → you should land on /api/upwork/callback with a JSON { ok: true, tokens: ... }

# Quick health checks:
curl -s https://notion-to-upwork.vercel.app/api/notion-debug
curl -s https://notion-to-upwork.vercel.app/api/sync
```

---

#### 4) Env expectations (no changes if already set)
- `UPWORK_CLIENT_ID` ✅
- `UPWORK_CLIENT_SECRET` ✅
- `UPWORK_REDIRECT_URI = https://notion-to-upwork.vercel.app/api/upwork/callback` ✅
- `UPWORK_SCOPES` (ensure it matches the key’s allowed scopes) ✅

---

#### 5) Log the result (append to **botchat.md → 📊 Activity Feed**)
```
### [YYYY-MM-DD | @codex-report]
OAuth callback: deployed
Auth: 302=<✅/❌> (from /api/upwork/auth)
Callback: <status + brief body snippet>
sync: <status + body>
Outcome: <success | error + note>
```
```

## 📊 Activity Feed
*(latest entries appear at the top)*

### [2025-10-27 | @codex-report]
_netcheck: {"ok":true,"checks":[{"url":"https://httpbin.org/get","ok":false,"status":503,"timeMs":53},{"url":"https://www.google.com","ok":true,"status":200,"timeMs":71},{"url":"https://www.upwork.com/api/v3/oauth2/token","ok":false,"status":405,"timeMs":231}]}
Callback: 502 {"ok":false,"error":"token_exchange_failed","details":{"error_description":"The provided authorization grant (e.g., authorization code, resource owner credentials) is invalid","error":"invalid_grant"}}
Outcome: still failing — Upwork rejects authorization code; need valid OAuth approval

### [2025-10-27 | @codex-report]
Tokens table: pending (SQL committed; execution requires Supabase console)
Callback: 400 {"ok":false,"error":"missing code"}
Auto-refresh smoke test: not run (tokens unavailable without Upwork approval)
Outcome: error + note — OAuth wiring deployed, needs user authorization to obtain tokens
````markdown
### [2025-10-27 | @chatgpt → @codex]
```md
### [@chatgpt → @codex] Fix Upwork OAuth callback: surface real errors + remove node-fetch import

**Goal:** Resolve the "unknown error" during OAuth callback by using the built-in `fetch` in Vercel (Next.js runtime) and returning clearer error messages.

---

#### 1) Edit: `src/pages/api/upwork/callback.ts`
Replace the current code with:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, error } = req.query;

    if (error) return res.status(400).json({ ok: false, error });
    if (!code) return res.status(400).json({ ok: false, error: "missing code" });

    const client_id = process.env.UPWORK_CLIENT_ID!;
    const client_secret = process.env.UPWORK_CLIENT_SECRET!;
    const redirect_uri = process.env.UPWORK_REDIRECT_URI!;

    if (!client_id || !client_secret || !redirect_uri) {
      return res.status(500).json({ ok: false, error: "Missing UPWORK_* envs" });
    }

    const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri,
      }),
    });

    const data = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      return res.status(502).json({ ok: false, error: "token_exchange_failed", details: data });
    }

    await saveTokens({
      access_token: (data as any).access_token,
      refresh_token: (data as any).refresh_token,
      expires_in: (data as any).expires_in,
      scope: (data as any).scope,
    });

    return res.status(200).json({ ok: true, source: "callback", saved: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
```

---

#### 2) Commit & deploy
```bash
git add src/pages/api/upwork/callback.ts
git commit -m "fix(oauth): remove node-fetch and surface token exchange errors"
git push origin main
```

---

#### 3) Verify in production
```bash
# Expect HTTP/2 302 redirect:
curl -sI https://notion-to-upwork.vercel.app/api/upwork/auth | head -n 1

# Complete browser authorization and confirm callback:
open "https://notion-to-upwork.vercel.app/api/upwork/auth"
# Expected JSON:
# { "ok": true, "source": "callback", "saved": true }
```

---

#### 4) If error persists, check:
- `UPWORK_REDIRECT_URI` matches the registered callback exactly
- `UPWORK_CLIENT_ID` and `UPWORK_CLIENT_SECRET` are valid
- Vercel Runtime Logs (filter: `/api/upwork/callback`) for stack trace

---

#### 5) Report
```
### [YYYY-MM-DD | @codex-report]
Callback response: <status + JSON>
Outcome: <success | failed + error summary>
```
```
````

### [2025-10-27 | @codex-report]
Callback response: 502 {"error":"invalid_grant"}
Outcome: failed — Upwork rejected authorization code (invalid_grant)

### [2025-10-27 | @chatgpt → @codex] Improve callback error visibility

**Goal:** Replace `"[object Object]"` responses with readable JSON error info for debugging Upwork token exchange failures.

---

#### 1) Edit: `src/pages/api/upwork/callback.ts`

Wrap the final `catch` return to serialize any thrown object safely.

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { saveTokens } from "@/lib/upworkToken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, error } = req.query;

    if (error) return res.status(400).json({ ok: false, error });
    if (!code) return res.status(400).json({ ok: false, error: "missing code" });

    const client_id = process.env.UPWORK_CLIENT_ID!;
    const client_secret = process.env.UPWORK_CLIENT_SECRET!;
    const redirect_uri = process.env.UPWORK_REDIRECT_URI!;

    if (!client_id || !client_secret || !redirect_uri) {
      return res.status(500).json({ ok: false, error: "Missing UPWORK_* envs" });
    }

    const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri,
      }),
    });

    const data = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "token_exchange_failed",
        details: data,
      });
    }

    await saveTokens({
      access_token: (data as any).access_token,
      refresh_token: (data as any).refresh_token,
      expires_in: (data as any).expires_in,
      scope: (data as any).scope,
    });

    return res.status(200).json({ ok: true, source: "callback", saved: true });
  } catch (e: any) {
    const errorDetails =
      typeof e === "object" ? JSON.stringify(e, null, 2) : String(e);
    return res.status(500).json({ ok: false, error: errorDetails });
  }
}
```

---

#### 2) Commit & push

```bash
git add src/pages/api/upwork/callback.ts
git commit -m "chore(debug): stringify errors in Upwork callback"
git push origin main
```

---

#### 3) Re-run authorization

1. Open: `https://notion-to-upwork.vercel.app/api/upwork/auth`
2. Approve in Upwork  
3. Observe the callback result → now it should show the **real error payload** (likely from Upwork’s token endpoint).

---

#### 4) Report

```
### [YYYY-MM-DD | @codex-report]
Callback error payload: <full JSON from response>
Outcome: waiting for valid grant
```

### [2025-10-27 | @codex-report]
Callback error payload: 502 {"error":"invalid_grant","error_description":"The provided authorization grant (e.g., authorization code, resource owner credentials) is invalid"}
Outcome: waiting for valid grant

### [2025-10-27 | @chatgpt → @codex] Harden OAuth callback networking + add `_netcheck`
**Goal:** Resolve `{"ok":false,"error":"fetch failed"}` by configuring Undici (Node fetch) and adding a simple outbound networking probe.

---

#### 1) Patch callback HTTP client (Undici) + keep Node runtime
File: `src/pages/api/upwork/callback.ts` — add the dispatcher *once* near the imports and include a UA header on the Upwork request.

```ts
// NEW (top of file, after other imports)
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connect: { timeout: 10_000 }
}));

export const config = { runtime: "nodejs" }; // ensure Node runtime

// ... inside the existing fetch to Upwork:
const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "notion-to-upwork/1.0 (+vercel)"
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri,
  }),
});
```

---

#### 2) Add outbound network probe
File: `src/pages/api/_netcheck.ts` — new file.

```ts
import type { NextApiRequest, NextApiResponse } from "next";
export const config = { runtime: "nodejs" };

async function tryFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const r = await fetch(url, init);
    return { url, ok: r.ok, status: r.status, timeMs: Date.now() - started };
  } catch (e: any) {
    return { url, ok: false, error: e?.message ?? String(e), timeMs: Date.now() - started };
  }
}

export default async function handler(_: NextApiRequest, res: NextApiResponse) {
  const checks = await Promise.all([
    tryFetch("https://httpbin.org/get"),
    tryFetch("https://www.google.com"),
    tryFetch("https://www.upwork.com/api/v3/oauth2/token", { method: "HEAD" }),
  ]);
  res.status(200).json({ ok: true, checks });
}
```

---

#### 3) (If Upwork-only fails) pin region for callback
Optionally force the callback to US‑East which tends to be the most reliable to Upwork. Add/merge on the callback export:

```ts
export const config = { runtime: "nodejs", regions: ["iad1"] };
```
> If you already export `config`, just add `regions: ["iad1"]` to it.

---

#### 4) Commit & deploy
```bash
git add -A
git commit -m "fix(oauth): harden undici, add _netcheck, optional region pin for callback"
git push origin main
```

---

#### 5) Verify
```bash
# Auth should still redirect:
curl -sI https://notion-to-upwork.vercel.app/api/upwork/auth | head -n1  # expect HTTP/2 302

# Outbound network check:
open "https://notion-to-upwork.vercel.app/api/_netcheck"

# Complete browser OAuth and confirm callback:
open "https://notion-to-upwork.vercel.app/api/upwork/auth"
# Expect: { "ok": true, "saved": true }  (or a clear token_exchange_failed with details if the code is stale)
```

---

#### 6) Report
```
### [YYYY-MM-DD | @codex-report]
_netcheck: <paste JSON>
Callback: <status + body>
Outcome: <resolved | still failing + next idea>
```

### [2025-10-27 | @chatgpt → @codex] Improve Upwork callback error reporting (final fix)

**Goal:** Replace `[object Object]` errors with structured JSON including upstream status and body, and verify OAuth completion with a fresh code.

---

#### 1) Edit: `src/pages/api/upwork/callback.ts`

Replace the error-handling block with this:

```ts
try {
  const res = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "notion-to-upwork/1.0 (+vercel)",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri,
    }),
  });

  const raw = await res.text();
  let body: unknown = raw;
  try { body = JSON.parse(raw); } catch { /* keep as text */ }

  if (!res.ok) {
    return resp.status(res.status).json({
      ok: false,
      error: "token_exchange_failed",
      status: res.status,
      body,
    });
  }

  const data = body as { access_token:string; refresh_token:string; expires_in:number; scope?:string };
  await saveTokens(data);
  return resp.status(200).json({ ok: true, saved: true });
} catch (e: any) {
  return resp.status(500).json({
    ok: false,
    error: e?.message ?? "unexpected_error",
    details: e && typeof e === "object" ? JSON.stringify(e) : String(e),
  });
}
```

---

#### 2) Deploy
```bash
git add src/pages/api/upwork/callback.ts
git commit -m "fix(oauth): surface upstream status and body on token exchange errors"
git push origin main
```

---

#### 3) Verify in production
1. Open: `https://notion-to-upwork.vercel.app/api/upwork/auth`
2. Approve in Upwork to generate a **fresh code**
3. Observe callback JSON  
   - ✅ `{ "ok": true, "saved": true }` → success  
   - ❌ otherwise: structured JSON with `"status"` and `"body"` fields showing Upwork’s real message.

---

#### 4) Expected `_netcheck`
405 for Upwork is normal (the endpoint rejects `HEAD`, proving reachability).  
503 for httpbin.org is also fine; Vercel often blocks it.

---

#### 5) Report
```
### [YYYY-MM-DD | @codex-report]
Callback: <status + body snippet>
_netcheck: <summary of google=200, upwork=405>
Outcome: <success | still failing + reason>
```
### [2025-10-27 | @codex-report]
Callback: 502 {"error":"token_exchange_failed","status":502,"body":{"error":"invalid_grant","error_description":"The provided authorization grant (e.g., authorization code, resource owner credentials) is invalid"}}
_netcheck: httpbin=200, google=200, upwork=405
Outcome: still failing — valid Upwork authorization code required

````markdown
### [2025-10-27 | @chatgpt → @codex] Stabilize Upwork token exchange: retries + endpoint fallback + structured errors

**Why:** Latest callback shows `TypeError: fetch failed` from Undici (Node fetch). That’s a network‑level failure, not an OAuth denial. We’ll make the exchange resilient with (1) retries, (2) alternate endpoint, and (3) fully structured error output so we can see exactly where it fails next time.

---

#### 1) Edit `src/pages/api/upwork/callback.ts` (add robust token exchange)
Paste this at the top (after other imports). If `Agent/setGlobalDispatcher` exists already, keep your current values and just add the retry helpers below.

```ts
// Networking hardening (if not already present):
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connect: { timeout: 10_000 },
}));

// Retry helpers
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

type XResult =
  | { ok: true; status: number; json: any; endpoint: string }
  | { ok: false; status?: number; body?: string; error?: string; endpoint: string };

async function exchangeWithRetry(params: {
  authB64: string;
  code: string;
  redirectUri: string;
  attempts?: number;          // default 3
  backoffMs?: number;         // default 400
}) : Promise<XResult> {
  const { authB64, code, redirectUri } = params;
  const attempts = params.attempts ?? 3;
  const backoffMs = params.backoffMs ?? 400;

  // Two equivalent endpoints, some regions resolve one more reliably than the other
  const endpoints = [
    "https://www.upwork.com/api/v3/oauth2/token",
    "https://api.upwork.com/api/v3/oauth2/token",
  ];

  for (const endpoint of endpoints) {
    let lastErr: any = null;

    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Basic ${authB64}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "notion-to-upwork/1.0 (+vercel)",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });

        const raw = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch {}

        if (!res.ok) {
          // Bubble upstream body so we can see invalid_grant etc.
          return { ok: false, status: res.status, body: raw, endpoint };
        }

        return { ok: true, status: res.status, json: parsed ?? raw, endpoint };
      } catch (e: any) {
        lastErr = e;
        // Transient: backoff and retry
        await sleep(backoffMs * (i + 1));
      }
    }

    // All attempts failed on this endpoint; surface last error
    return { ok: false, error: lastErr?.message ?? String(lastErr), endpoint };
  }

  // Should never happen
  return { ok: false, error: "unreachable", endpoint: "n/a" };
}
```

Now replace the current token‑exchange block inside the handler with:

```ts
const client_id = process.env.UPWORK_CLIENT_ID!;
const client_secret = process.env.UPWORK_CLIENT_SECRET!;
const redirect_uri = process.env.UPWORK_REDIRECT_URI!;
const authB64 = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

const result = await exchangeWithRetry({
  authB64,
  code: String(code),
  redirectUri: redirect_uri,
});

if (!result.ok) {
  // Network or upstream failure
  return res.status(result.status ?? 502).json({
    ok: false,
    error: "token_exchange_failed",
    status: result.status,
    endpoint: result.endpoint,
    body: result.body,
    details: result.error,
  });
}

// Success path: persist and return
const data = result.json as { access_token:string; refresh_token:string; expires_in:number; scope?:string };
await saveTokens({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_in: data.expires_in,
  scope: data.scope,
});
return res.status(200).json({ ok: true, saved: true, endpoint: result.endpoint });
```

> Leave `export const config = { runtime: "nodejs", regions: ["iad1"] }` in place if you already added it.

---

#### 2) Commit & deploy
```bash
git add src/pages/api/upwork/callback.ts
git commit -m "fix(oauth): add retries + endpoint fallback + structured errors on token exchange"
git push origin main
```

---

#### 3) Verify (prod)
```bash
# Redirect still healthy
curl -sI https://notion-to-upwork.vercel.app/api/upwork/auth | head -n1

# Run real OAuth in the browser (fresh code)
open "https://notion-to-upwork.vercel.app/api/upwork/auth"
# Expected:
#  - ✅ { "ok": true, "saved": true, "endpoint": "<chosen-endpoint>" }
#  - ❌ { "ok": false, "error": "token_exchange_failed", "status": <code>, "endpoint": "...", "body": "...", "details": "<message>" }
```

---

#### 4) Report
```
### [YYYY-MM-DD | @codex-report]
Callback: <status + JSON incl. endpoint/body>
Outcome: <success | failing + next hypothesis>
```
````
### [2025-10-27 | @codex-report]
Callback: 400 {"error":"token_exchange_failed","status":400,"endpoint":"https://www.upwork.com/api/v3/oauth2/token","body":{"error":"invalid_grant","error_description":"The provided authorization grant (e.g., authorization code, resource owner credentials) is invalid"}}
Outcome: still failing — need fresh OAuth approval with valid code
