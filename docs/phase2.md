# Phase 2: UpworkToNotion → Hosted SaaS

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
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id),
  notion_token     text,
  job_feed_db_id   text,
  filters_db_id    text,
  diary_db_id      text,
  upwork_person_id text,
  upwork_client_id     text,
  upwork_client_secret text,
  last_sync_at     timestamptz,
  last_sync_result jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

### Upwork OAuth — per user, not shared app
**Key decision change from original plan:** each user registers their own Upwork API app and provides their Client Key + Secret. The app does not use a shared operator Upwork app.

- Settings page shows the callback URL (`https://upwork-to-notion.vercel.app/api/upwork/callback`) with a copy button
- User registers app at upwork.com/developer/keys, pastes Key + Secret, saves, then clicks Connect
- OAuth state encoded as `${userId}:${nonce}` to bind callback to the right user
- After OAuth, person ID auto-fetched via GraphQL `{ user { id } }` and saved to `user_settings` — **no manual input required**

### Settings page
- Upwork section: Client Key, Client Secret, callback URL copy button, Connect button (disabled until Key + Secret saved)
- Notion section: Integration Token, Job Feed DB ID, Filters DB ID, Diary DB ID
- **Upwork Person ID removed from UI** — fetched automatically post-OAuth

### Sync fan-out
- GitHub Actions cron `*/30 * * * *` (every 30 min) calls `/api/sync` with `Authorization: Bearer API_SECRET`
- Dashboard "Sync Now" calls `/api/sync` authenticated via Supabase session
- `/api/sync` dual-path: Bearer token → sync all users; session → sync current user only
- Per-user: uses their Notion token, DB IDs, Upwork token, and person ID
- `fetchUpworkItems()` updated to accept optional `accessToken` param (was using singleton token, causing silent failures)

### Cron
- **Vercel cron removed** — replaced with GitHub Actions (free, no Pro plan needed)
- `.github/workflows/sync.yml` — 30-min schedule, manual trigger via `workflow_dispatch`
- Requires `API_SECRET` added to GitHub repo secrets (Settings → Secrets → Actions)

---

## What changed vs original plan

| Original plan | What actually happened |
|---|---|
| Shared Upwork OAuth app (operator provides Key/Secret as env vars) | Each user brings their own Upwork API app |
| Upwork Person ID entered manually in settings | Auto-fetched from Upwork GraphQL after OAuth |
| Vercel Pro cron every 3h | GitHub Actions free cron every 30 min |
| `src/middleware.ts` | `src/proxy.ts` (Next.js 16 convention) |
| Filters DB ID not in settings | Added to settings form |

---

## Bugs fixed during implementation

- `upwork_tokens.user_id` missing unique constraint → added `UNIQUE` constraint
- `upwork_tokens.id` NOT NULL with no default for new rows → added `DEFAULT gen_random_uuid()`
- `fetchUpworkItems()` used singleton token → updated to accept `accessToken` param
- `auth/callback.tsx` didn't handle PKCE `?code=` param → added `exchangeCodeForSession`
- Supabase Site URL pointed to localhost → must be set to production URL in Auth → URL Configuration
- Next.js prerendered `/auth/signin` at build time → `getSupabaseBrowser()` moved inside lazy `useState`

---

## New env vars required

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (same as `SUPABASE_URL`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (NOT service role) |

Both needed in `.env.local` and Vercel environment variables.

---

## Next steps (Phase 3)

- **GitHub Actions secret** — confirm `API_SECRET` added to repo secrets so cron fires automatically
- **Google OAuth** — optional; requires Google Cloud Console OAuth client + Supabase Auth provider config
- **Auto-create Notion databases** — remove need for users to manually create 3 DBs and share with integration
- **Onboarding flow** — guide new users step by step (currently requires reading docs)
- **Email notifications** — alert when new matching jobs appear (Resend)
- **Freelancer profile snapshot** — sync JSS, earnings, top-rated status to Notion
- **Sync history log** — per-user log of each sync run
- **Billing / usage limits** — Stripe when scaling beyond ~10 users
- **Custom domain** — buy via Hostinger (~$10-15/yr), point to Vercel via CNAME
