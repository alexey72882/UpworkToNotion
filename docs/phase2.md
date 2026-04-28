# Phase 2: Multi-tenant SaaS

## Status: Complete ✓

Deployed to https://upwork-to-notion.vercel.app on 2026-04-20. End-to-end working: sign up → connect Upwork → configure Notion → sync jobs.

---

## What was built

### Auth
- Supabase Auth with email sign-up (Google OAuth optional, requires Google Cloud Console setup)
- `src/pages/auth/signin.tsx` — Auth UI with email + Google
- `src/pages/auth/callback.tsx` — PKCE code exchange (`supabase.auth.exchangeCodeForSession`)
- `src/proxy.ts` — redirects unauthenticated users from `/dashboard`, `/settings` to `/auth/signin`
  - **Note:** Next.js 16 deprecated `middleware.ts` in favour of `proxy.ts` with a `proxy` export

### Supabase schema
```sql
ALTER TABLE upwork_tokens ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE upwork_tokens ADD CONSTRAINT upwork_tokens_user_id_key UNIQUE (user_id);
ALTER TABLE upwork_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

CREATE TABLE user_settings (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id),
  notion_token         text,
  job_feed_db_id       text,
  diary_db_id          text,
  upwork_person_id     text,
  upwork_client_id     text,
  upwork_client_secret text,
  last_sync_at         timestamptz,
  last_sync_result     jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
```
Note: `filters_db_id` was planned but never implemented — filters DB comes from env var `NOTION_JOB_FILTERS_DATABASE_ID`.

### Upwork OAuth — per user, not shared app
**Key decision change from original plan:** each user registers their own Upwork API app and provides their Client Key + Secret.

- Settings page shows the callback URL with a copy button
- User registers app at upwork.com/developer/keys, pastes Key + Secret, saves, then clicks Connect
- OAuth state encoded as `${userId}:${nonce}` to bind callback to the right user
- After OAuth, person ID auto-fetched via `{ user { id } }` and saved — **no manual input required**

### Settings page
- Upwork section: Client Key, Client Secret, callback URL copy button, Connect button
- Notion section: Integration Token, Job Feed DB ID, Work Diary DB ID
- **Upwork Person ID removed from UI** — fetched automatically post-OAuth

### Sync
- `/api/sync` dual-path: `Authorization: Bearer API_SECRET` → sync all users; Supabase session → sync current user only
- Per-user: uses their Notion token, DB IDs, Upwork token, and person ID
- **Cron trigger:** cron-job.org, every 2 minutes, hits `/api/sync` with Bearer token
- **GitHub Actions** (`sync.yml`): schedule disabled, `workflow_dispatch` kept for manual runs
- **Vercel**: no cron configured

---

## What changed vs original plan

| Original plan | What actually happened |
|---|---|
| Shared Upwork OAuth app | Each user brings their own Upwork API app |
| Upwork Person ID entered manually | Auto-fetched from Upwork GraphQL after OAuth |
| GitHub Actions free cron every 30 min | cron-job.org every 2 min (GitHub Actions disabled) |
| `src/middleware.ts` | `src/proxy.ts` (Next.js 16 convention) |
| `filters_db_id` in user settings | Never implemented — comes from env var only |

---

## Bugs fixed during implementation

- `upwork_tokens.user_id` missing unique constraint → added `UNIQUE` constraint
- `upwork_tokens.id` NOT NULL with no default for new rows → added `DEFAULT gen_random_uuid()`
- `fetchUpworkItems()` used singleton token → updated to accept `accessToken` param
- `auth/callback.tsx` didn't handle PKCE `?code=` param → added `exchangeCodeForSession`
- Supabase Site URL pointed to localhost → must be set to production URL in Auth → URL Configuration
- Next.js prerendered `/auth/signin` at build time → `getSupabaseBrowser()` moved inside lazy `useState`

---

## Env vars added in Phase 2

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (same as `SUPABASE_URL`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (NOT service role) |

Both needed in `.env.local` and Vercel environment variables.
