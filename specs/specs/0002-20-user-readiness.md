# 0002 – 20-user readiness (sync pipeline scaling)

**Status:** Planned
**Owner:** @alexey72882

## Context

We want to onboard ~20 users with current functionality. A stress test against live production data (Supabase `sync_logs` + the real Notion job-feed DB) shows the sync is **already at its breaking point with a single user** — onboarding is impossible without changes.

### Stress-test findings (measured, not estimated)

| Metric | Measured value | Source |
|--------|----------------|--------|
| Active users today | 1 | `user_settings` where `notion_token` not null |
| Per-run sync duration (1 user) | 32–44s typical, 51s max | `sync_logs.duration_ms`, last 12 runs |
| Vercel function hard timeout | 60s | `vercel.json` `maxDuration: 60` |
| Job-feed Notion DB size | 5,633 pages | live Notion query |
| `fetchJobFeedPageMap` cost | 57 requests, 27.4s | live measurement |

**Root cause:** `fetchJobFeedPageMap` (`src/lib/notion.ts`) scans the *entire* accumulated job-feed DB on every cron run, for every user, unthrottled (`sync.ts:106`; job feed isn't throttled like proposals/diary). It's O(total jobs), grows forever (no date filter, no pruning), and already eats 27s of the ~35s run.

**Why 20 users is impossible today:** users are processed in a sequential loop (`sync.ts:179`) inside one 60s function.
- 2 users ≈ 70s → exceeds the 60s timeout already.
- 20 users ≈ ~700s (12 min) → impossible on any Vercel tier (Pro max is 300s).
- On timeout, tail users never sync (no `ORDER BY` → an unpredictable subset each slow run).

### Secondary findings
- No retry/backoff anywhere (`notion.ts`, `upwork.ts` `gqlFetch`, `upworkClient.ts`): one transient 429/5xx fails that user's whole track for the run.
- Per-app Upwork rate limit: all users share one `UPWORK_CLIENT_ID` — the real cross-user ceiling. Any parallelization must be bounded + retry-aware.
- `duration_ms` telemetry bug (`sync.ts:211`): measured from handler start, so per-user timing is cumulative/wrong once multi-user.
- Token-refresh race (`upworkToken.ts` `getValidAccessToken`): no lock; low severity while sequential, higher once parallelized.
- Notion rate limit is per-user-token (`getNotionForUser`, `sync.ts:46`), NOT a shared aggregate — so it is not a cross-user bottleneck.

## Goal

Reliably sync ~20 users with current functionality: no timeouts, no starved users, resilient to transient API errors. Success = a full cron cycle completes for all 20 users within timeout, verified against real timing.

## Plan

### Step 1 — Eliminate the full-DB page-map rescan (the 27s killer) — highest impact

**Regression history:** the bulk page-map was a deliberate, correct fix (commit `9db4c2e`) for Notion eventual-consistency duplicates — same fix as the diary after the "104 rows for 5 IDs" incident. It was originally bounded to `Created ≥ last 24h`. Commit `d29ef7c` silently deleted that `since` filter, turning it into an unbounded full-table scan that grew to 5,633 pages / 27s.

**Chosen fix — targeted per-run-ID query (NOT Supabase-backed dedup):**
- Replace `fetchJobFeedPageMap`'s full-DB scan with a Notion query filtering `External ID` by an `or` of the exact ~10–30 IDs fetched this run. Reuse the `findPageByExternalId` filter shape; replace the bulk-map call at `sync.ts:106`.
- Still checks the database for those IDs (existing rows → update). The only residual gap is Notion's eventual-consistency lag — which the full scan had identically, so we lose zero safety while dropping ~27s.
- Preserve dedup guarantees: keep the in-run newly-created-ID set so items within one run can't re-create each other; rely on non-overlapping run cadence for cross-run safety.
- Out of scope: moving the dedup key into Supabase. Considered and declined — targeted query matches current safety at far lower cost.
- Do NOT touch `fetchDiaryPageMap` — already bounded to the current week, cheap and correct.

### Step 2 — Fan-out so users don't share one 60s function
- Cron `/api/sync` becomes a dispatcher: fetch user IDs, then fire one lightweight self-call per user (e.g. `POST /api/sync/user` with `{ userId }`, guarded by `API_SECRET`), not awaiting them serially. Each user runs in its own function instance under its own timeout.
- Extract the existing `syncUser()` body (`sync.ts:45`) into the per-user route; keep the per-user try/catch isolation.
- Bound fan-out concurrency (Step 3) to respect the shared Upwork app rate limit.

### Step 3 — Bounded concurrency + retry/backoff (Upwork app-limit aware)
- Add a concurrency limiter (`p-limit`, ~3–5 concurrent users) around the fan-out.
- Add exponential-backoff retry (3 attempts, jitter) around Notion writes and Upwork `gqlFetch` — retry on 429/5xx only, honor `Retry-After`. Reuse the `exchangeWithRetry` pattern in `src/pages/api/upwork/callback.ts`.

### Step 4 — Vercel Pro (billing, not code)
Free tier (4 hr/month CPU) is already ~2.3 hr/month for one user. Upgrade to Pro before onboarding; raise `maxDuration` for the per-user route to 120–300s for headroom.

### Step 5 — Cleanups surfaced by the test
- Fix `duration_ms` to measure per-user time (`sync.ts:211`).
- Add a compare-and-swap / short lock on `getValidAccessToken` refresh (`upworkToken.ts`).
- (Optional) prune/archive job-feed pages older than N days so the DB can't grow unbounded again.

## Critical files
- `src/pages/api/sync.ts` — dispatcher + extract `syncUser` (Steps 1,2,5)
- `src/lib/notion.ts` — replace full-DB `fetchJobFeedPageMap` with targeted ID query; add retry (Steps 1,3)
- `src/lib/upwork.ts` — retry/backoff in `gqlFetch` (Step 3)
- `src/lib/upworkToken.ts` — refresh lock (Step 5)
- `vercel.json` — `maxDuration` for per-user route (Step 4)
- `package.json` — add `p-limit` (Step 3)

## Verification
1. Re-run the empirical benchmark (read-only Supabase/Notion scripts) after Step 1 — confirm per-user duration drops from ~35s to <10s.
2. `npm run test`, `npm run build`, `npm run lint` all exit 0.
3. Trigger `/api/sync` with `Authorization: Bearer $API_SECRET`; confirm it dispatches and returns quickly, and each per-user route completes under timeout in Vercel logs.
4. Seed 2–3 test users and confirm no run exceeds timeout and every user gets a fresh `last_sync_at`.
5. Inject a forced Notion 429 and confirm the retry path recovers instead of skipping the user.
