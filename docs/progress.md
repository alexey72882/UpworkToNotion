# Project Progress

> **Last updated:** 2026-04-28
> **Live at:** https://upwork-to-notion.vercel.app

---

## Current Status: Phase 2 Complete

Full multi-tenant SaaS is live. Users can sign up, connect their own Upwork API app and Notion workspace, and have jobs synced automatically.

---

## What's Live

### Auth
- Supabase email sign-up + sign-in
- PKCE OAuth callback (`/auth/callback`)
- Route guard via `src/proxy.ts` (redirects unauthenticated users)

### Sync Pipeline (3 parallel tracks per cron run)

| Track | Source | Destination | Frequency |
|-------|--------|-------------|-----------|
| Job feed | Upwork `marketplaceJobPostingsSearch` | Notion Job Feed DB | Every cron run (~2 min) |
| Proposals | Upwork `vendorProposals` | In-memory (cross-reference only) | Throttled: once/hour |
| Work diary | Upwork `workDiaryContract` | Notion Work Diary DB | Throttled: once/10 min |

**Cron trigger:** cron-job.org hits `https://upwork-to-notion.vercel.app/api/sync` every 2 minutes with `Authorization: Bearer <API_SECRET>`.

### Upwork OAuth
- Per-user: each user registers their own Upwork API app
- Person ID auto-fetched post-OAuth via `{ user { id } }` — no manual input
- Tokens stored per-user in Supabase `upwork_tokens`, auto-refreshed

### Notion Integration
- 2 writable databases: Job Feed, Work Diary
- 1 readable database: Filters (env var `NOTION_JOB_FILTERS_DATABASE_ID`)
- Upsert keyed on `External ID` (dedup-safe, idempotent)
- SDK pinned to API version `2022-06-28`

### Web UI

| Page | Status |
|------|--------|
| `/dashboard` | Live. Shows sync status, last sync time, seconds counter. Polls every 15s. Toast on sync. |
| `/settings` | Live. Upwork tab (Client Key/Secret + OAuth) + Notion tab (token + DB IDs). |
| `/filters` | Live. Web-based filter editor — skill, category/subcategory, job type, budget, experience, duration, client history, verified payment. |
| `/profile` | Live. Name, password change, delete account. |
| `/auth/signin` | Live. Email sign-up/in. |

### Filters
12 filter fields supported client-side: skill expression, category (12 options), subcategory (70 options), job type, hourly rate range, fixed budget range, experience level, duration, client hires, client rating, verified payment only, proposals cap.

---

## Known Hard Limits (Upwork API)

- **Job feed cap:** 10 results per query, no pagination. Jobs posted between syncs beyond 10 are permanently missed. Mitigation: 2-minute sync interval.
- **`contractList` / `vendorContracts`:** blocked (Partner API scope). Workaround: `talentWorkHistory`.
- **`transactionHistory`:** blocked (Payments scope). Weekly earnings not available.
- **`budgetRange_eq` / `hourlyRate_eq`:** silently ignored by Upwork. Budget filtering is client-side.
- **`workload_eq`:** returns 0 results. Workload filter removed from pipeline.
- **`vendorProposals` max:** 40 per page.

See `docs/upwork-api.md` for full details.

---

## Supabase Schema (current)

```sql
-- OAuth tokens, one row per user
CREATE TABLE upwork_tokens (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      uuid UNIQUE REFERENCES auth.users(id),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at   bigint NOT NULL,
  scope        text,
  updated_at   timestamptz DEFAULT now()
);

-- Per-user settings and sync state
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
  last_proposals_sync_at timestamptz,
  last_diary_sync_at   timestamptz,
  prev_sync_at         timestamptz,
  web_filter           jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
```

---

## Phase 3 Roadmap

| Item | Notes |
|------|-------|
| Auto-create Notion databases | Remove need for users to manually create 3 DBs |
| Onboarding flow | Step-by-step guide for new users |
| Email notifications | Alert when new matching jobs appear (Resend) |
| Freelancer profile snapshot | Sync JSS, earnings, top-rated status to Notion |
| Sync history log | Per-user log of each sync run with results |
| Google OAuth | Requires Google Cloud Console OAuth client + Supabase config |
| Custom domain | ~$10-15/yr via Hostinger, CNAME to Vercel |
| Billing / usage limits | Stripe, when scaling beyond ~10 users |
