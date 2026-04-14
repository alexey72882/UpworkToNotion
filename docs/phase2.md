# Phase 2: UpworkToNotion → Hosted SaaS

## Context

The current app is a single-tenant personal tool: one Upwork account, one Notion workspace, credentials hardcoded via env vars, cron runs once daily at 9am UTC. Phase 2 converts it to a multi-tenant hosted SaaS where any freelancer can sign up, connect their own Upwork + Notion accounts, and have their jobs/contracts synced automatically — no code required.

Priority quick win: increase sync frequency from daily → every 3 hours.

---

## Architecture decisions

| Concern | Choice | Reason |
|---|---|---|
| Auth | **Supabase Auth** | Already have Supabase in stack; supports email + Google OAuth |
| Per-user tokens | **`upwork_tokens` with `user_id`** | Replace singleton row with per-user rows |
| User settings | **New `user_settings` Supabase table** | Store Notion token + 3 DB IDs per user |
| Cron | **Vercel Pro cron `0 */3 * * *`** | Simplest path; requires plan upgrade |
| Frontend | **Next.js pages** (already in stack) | Add `/`, `/dashboard`, `/settings` |

---

## Implementation

### 1. Supabase schema (run in Supabase dashboard)

```sql
-- Add user_id to existing upwork_tokens table
ALTER TABLE upwork_tokens ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- Per-user Notion settings
CREATE TABLE user_settings (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id),
  notion_token     text,
  job_feed_db_id   text,
  filters_db_id    text,
  diary_db_id      text,
  upwork_person_id text,
  last_sync_at     timestamptz,
  last_sync_result jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

### 2. Auth pages

New files:
- `src/pages/auth/signin.tsx` — Supabase Auth UI (`@supabase/auth-ui-react`) with email + Google
- `src/pages/auth/callback.tsx` — handles Supabase Auth redirect after OAuth
- `src/middleware.ts` — redirect unauthenticated users from `/dashboard`, `/settings` to `/signin`
- `src/lib/supabaseBrowser.ts` — `createBrowserClient()` for client-side session (separate from existing service-role client)
- `src/lib/supabaseServer.ts` — `createServerClient()` for API route session reading

New dependencies:
```bash
npm install @supabase/ssr @supabase/auth-ui-react @supabase/auth-ui-shared
```

### 3. Upwork OAuth — bind to user

**`src/pages/api/upwork/auth.ts`** — read user session, encode `userId` in OAuth state (`${userId}:${nonce}`).

**`src/pages/api/upwork/callback.ts`** — decode `userId` from state, save tokens to `upwork_tokens` with `user_id` column instead of singleton `id = "singleton"`.

**`src/lib/upworkToken.ts`** — `getValidAccessToken(userId: string)` — query by `user_id` instead of `id = "singleton"`.

### 4. Notion settings as user input (not env vars)

**`src/lib/notion.ts`** — add `getNotionForUser(token: string): Client` alongside existing `getNotion()`. Update `readJobFilters`, `upsertJobFeedItem`, `upsertContractDayItem` to accept a `Client` parameter instead of reading env vars.

**`src/pages/api/user/settings.ts`** (new) — `GET` returns current settings, `PATCH` upserts to `user_settings`. Auth-gated via Supabase session.

### 5. Sync fan-out across users

**`src/pages/api/sync.ts`** — change from single-tenant to multi-tenant:
1. Query all users who have both `upwork_tokens` and `user_settings.notion_token` configured
2. For each user: run the existing job feed + contract pipeline with their tokens/DB IDs
3. Write `last_sync_at` + result counts back to `user_settings`

The existing `fetchJobFeed`, `fetchContractDays`, `upsertJobFeedItem` etc. are already parameterized on token — pass user-specific values.

### 6. Settings page

**`src/pages/settings.tsx`** — form with:
- Notion Token (paste from Notion integrations page)
- Job Feed Database ID
- Filters Database ID
- Diary Database ID
- Upwork Person ID (numeric, from Upwork profile URL)
- "Save" → `PATCH /api/user/settings`
- "Connect Upwork" button → `/api/upwork/auth`

### 7. Dashboard page

**`src/pages/dashboard.tsx`** — shows:
- Upwork connection status (✓/✗) + "Reconnect" button
- Notion connection status (checks if token + DB IDs are saved)
- Last sync time + result counts (from `user_settings.last_sync_result`)
- "Sync Now" button → `GET /api/sync`

### 8. Landing page

**`src/pages/index.tsx`** — marketing page:
- Headline + value prop
- Feature list (job feed, contracts, filters)
- "Get started free" → `/auth/signin`

### 9. More frequent cron

**`vercel.json`**:
```json
{
  "crons": [
    { "path": "/api/sync", "schedule": "0 */3 * * *" }
  ]
}
```

⚠️ Requires **Vercel Pro plan** upgrade before deploying (Hobby plan is limited to daily crons).

---

## Files to modify

| File | Change |
|------|--------|
| `src/lib/upworkToken.ts` | Add `userId` param to `getValidAccessToken` |
| `src/lib/notion.ts` | Add `getNotionForUser(token)`, thread token through all functions |
| `src/lib/upwork.ts` | Pass token explicitly (already partially done) |
| `src/pages/api/upwork/auth.ts` | Encode `userId` in state |
| `src/pages/api/upwork/callback.ts` | Decode `userId`, save per-user row |
| `src/pages/api/sync.ts` | Fan-out across all users |
| `vercel.json` | Cron schedule `0 */3 * * *` |

## Files to create

- `src/middleware.ts`
- `src/lib/supabaseBrowser.ts`
- `src/lib/supabaseServer.ts`
- `src/pages/auth/signin.tsx`
- `src/pages/auth/callback.tsx`
- `src/pages/dashboard.tsx`
- `src/pages/settings.tsx`
- `src/pages/index.tsx`
- `src/pages/api/user/settings.ts`

---

## Phase 3 — Post-MVP

- Auto-create Notion databases on onboarding (Notion API can create DBs)
- Email notifications when new matching jobs appear (Resend)
- Sync history log per user
- Billing / usage limits (Stripe)
- Multi experience level: run separate queries per level selected
- Freelancer profile snapshot: sync JSS, total earnings, top-rated status to Notion

---

## Verification

1. `npm run test` — all 27 tests pass
2. `npm run build` — zero type errors
3. New user flow: sign up → connect Upwork (OAuth) → paste Notion token + DB IDs → "Sync Now" → jobs appear in their Notion DB
4. Multi-user isolation: two accounts with different filters sync independently
5. Cron: verify 3-hour runs in Vercel production logs after Pro plan upgrade
