# Engineering notes

Durable implementation reference and a dated worklog. Split out of `CLAUDE.md` to keep that file focused on guidance. Forward-looking plans live in `specs/specs/`.

---

## Reference

### Notion Job Feed DB — schema

| Property | Type | Notes |
|----------|------|-------|
| `Name` | Title | Job title |
| `Description` | Rich text | Truncated to 2000 chars |
| `External ID` | Rich text | `job-<upwork_id>` — dedup key |
| `Client` | Rich text | Client's country |
| `Value` | Number | Fixed-price amount only (USD). Empty for hourly jobs. |
| `Rate Min` | Number | Hourly job minimum rate (USD). Empty for fixed jobs. |
| `Rate Max` | Number | Hourly job maximum rate (USD). Empty for fixed jobs. |
| `Job Type` | Select | `Hourly` or `Fixed` |
| `Workload` | Select | Raw `engagement` string from API (e.g. "Less than 30 hrs/week"). Populated when API returns it (~50% of jobs). Use for manual Notion filtering only — not filtered in pipeline. |
| `Applied` | Checkbox | True if you submitted a proposal |
| `Proposal link` | URL | Link to your proposal (when Applied = true) |
| `Upwork Link` | URL | Job posting URL |
| `Created` | Date | Published date |

### Contracts sync — 3-step work diary approach

`fetchContractDays()` in `src/lib/upwork.ts`:
1. `talentWorkHistory(filter: { personId: $UPWORK_PERSON_ID, status: [ACTIVE] })` → active contract IDs + titles + rates
2. Batched `workDays` queries → days with tracked activity this week (Mon–Sun UTC, yyyyMMdd format)
3. Batched `workDiaryContract` queries (up to 10 per request) → fetch `workDiaryTimeCells` with `cellDateTime.rawValue` timestamps → group into sessions (gap > 10 min = new session) → one Notion row per session with start/end datetime and `minutes = cell_count * 10`

Each session gets a unique `externalId` of the form `contract-<id>-<yyyyMMdd>-<HHmm>` (start time in UTC). The Notion `Date` field stores the session as a date range (`start` → `end`).

`/api/sync` accepts an optional `?force=diary` or `?force=proposals` query param to bypass the throttle interval and force-fetch that track immediately.

**User ID**: `540749103839944704` (Alexey, stored as `UPWORK_PERSON_ID`)

### Proposal submission — confirmed field values (2026-08-03)

`createJobProposal` mutation requires these exact values for Alexey's account:

```graphql
mutation {
  createJobProposal(input: {
    selectedContractor: {
      id: "540749103839944704"   # user.id (snowflake)
      oDeskUserID: "alexkievua"  # user.nid (username) — NOT rid, NOT numeric id
    }
    jobReference: "<numeric_job_id>"  # node.id from marketplaceJobPostingsSearch — NOT ciphertext
    chargedAmount: 50.0               # hourly rate or fixed bid
    coverLetter: "..."
    teamOrgId: "540749103848333313"   # organization.id from vendorProposals — NOT user.id
  }) { newProposalId status error }
}
```

The example above shows the required fields. The full `CreateJobProposalInput` (confirmed via introspection 2026-08-06) also accepts: `questions: [CreateProposalQuestion { question, answer }]` (screening-question answers — see below), `attachments`, `estimatedDuration`, `milestones: [CreateProposalMilestone]`, `boostBidAmount`, `occupationId`, `agencyOrgId`, `gitHubRepoLink`, `sri`, `umaTouched`, `umaThreadId`.

Key gotchas confirmed by testing:
- `oDeskUserID` = `nid` (username string `"alexkievua"`), NOT the numeric `rid` (`"6890346"`)
- `teamOrgId` = org ID `540749103848333313` (fetched via `vendorProposals { organization { id } }`), NOT user ID
- `jobReference` = numeric `id` from job search (e.g. `"2084364540816197571"`), NOT ciphertext (`~02...`)
- Permissions include "Grants access to submit proposal to jobs" — write access is confirmed working

**Screening questions (confirmed live 2026-08-06, read-only — no proposal submitted):**
- Fetch a single job's screening questions via `marketplaceJobPosting(id: "<numeric_id>")` → `contractorSelection { proposalRequirement { coverLetterRequired screeningQuestions { question sequenceNumber } } }`. `id` must be the **numeric** job id (same as `jobReference`); ciphertext `~02...` returns 404. `screeningQuestions` is `[]` when the job has none.
- Submit answers back via the `questions: [{ question, answer }]` field on `createJobProposal`.

### Dedup — bulk page map pattern

Both the work diary and job feed use a bulk page map to prevent duplicate Notion pages caused by eventual-consistency lag.

**Root cause:** Notion's `databases/query` endpoint has eventual-consistency lag — a page just created may not appear in filter results for several minutes. When two sync runs happened close together, run 2 couldn't find pages run 1 had just created, and inserted duplicates (observed: 104 diary rows for 5 distinct IDs on 2026-07-25; duplicate job feed rows).

**Fix:** Before any upserts, fetch existing pages into a `Map<externalId, pageId>` in memory. Each upsert does a local map lookup instead of a Notion query. Newly created pages are added to the map immediately so subsequent items in the same run can't re-create them. The per-item `findPageByExternalId` is kept as a fallback when no map is provided.

- **Diary:** `fetchDiaryPageMap(fromDate, toDate)` — fetches pages filtered to current week date range (bounded set).
- **Job feed:** `fetchJobFeedPageMap(externalIds)` — queries only the External IDs seen this run via an `or` filter (batched at 100/query, Notion's compound-filter cap). Cost is O(run size), not O(total DB). This replaced the old unbounded full-DB scan that grew to ~27s (0002 Step 1).

### Known quirks

- `vendorProposals` pagination limit is 40 (`first: 41+` returns VJCA-6 error)
- `marketplaceJobPostingsSearch` has no pagination — always returns 10 results per query, no `pagination` or `paginationInput` argument exists. This is a hard cap with no workaround at this API tier.
- `marketplaceJobPostingsSearch` only accepts 3 arguments: `marketPlaceJobFilter`, `searchType`, `sortAttributes`. Confirmed via schema introspection.
- Notion SDK v5 ships with API version `2025-09-03` which removed `databases/query` — must pass `notionVersion: "2022-06-28"` when creating the client
- Upwork OAuth scopes are configured at app level in developer portal, not via `scope` param in auth URL — passing `scope` returns `invalid_scope` error
- `workDays` / `workDiaryContract` date format: `yyyyMMdd` (not ISO)
- Weekly earnings blocked — requires Payments scope (`transactionHistory` returns "Authorization failed")
- Category multi-select names cannot contain commas — `"Web / Mobile & Software Dev"` used instead of `"Web, Mobile & Software Dev"`
- `Experience Level` is multi-select in Notion but Upwork API only accepts one value — only the first selected option is used
- `workload_eq` filter (`FULL_TIME` / `PART_TIME`) on `marketplaceJobPostingsSearch` returns 0 results — removed from the pipeline. Workload filter is not exposed in the UI. The `engagement` field on job nodes also returns `null` when `workload_eq` is active. Revisit if Upwork grants a higher API tier.
- `budgetRange_eq` on `marketplaceJobPostingsSearch` is completely non-functional — confirmed by testing with `{ rangeStart: 100, rangeEnd: 200 }` which returned jobs with $3–$5 and $10–$20 rates. The filter is silently ignored regardless of values. Same for `hourlyRate_eq`. Budget filtering is done entirely client-side.
- Hourly jobs have a rate range (min–max), not a single value. `hourlyBudgetMin` and `hourlyBudgetMax` are separate fields. Budget filter uses overlap logic: job is kept if its rate range intersects with the filter range.
- If more than 10 matching jobs are posted between syncs, the extras are permanently missed (no historical fetch possible). Mitigation: sync frequently via cron-job.org.
- Upwork GraphQL introspection works, including type-level `__type(name: "...")` (confirmed 2026-08-06 — used to introspect `CreateJobProposalInput`, `MarketplaceProposalRequirements`, etc.). An earlier note claimed `__type(name:)` was restricted/returned null; that was inaccurate.

### Sync infrastructure

- **Trigger**: cron-job.org calls `https://upwork-to-notion.vercel.app/api/sync` with `Authorization: Bearer <API_SECRET>` header
- **GitHub Actions** (`sync.yml`): schedule disabled, `workflow_dispatch` kept for manual runs
- **Vercel**: no cron configured (`vercel.json` has no `crons` key)
- Overlapping syncs are safe — Notion upserts are idempotent (dedup by `External ID`)

---

## Worklog

### What's done (as of 2026-07-31)

- Full OAuth flow working (auth → callback → tokens saved to Supabase)
- Upwork GraphQL schema discovered via `/api/upwork/gql-introspect`
- Sync pipeline: three parallel tracks per cron run:
  1. **Proposals** (`fetchUpworkItems`): fetches pending/active/hired proposals, used for cross-referencing job feed items with submitted proposals
  2. **Job feed** (`fetchJobFeed`): reads filters from `user_settings.web_filter` (Supabase) via `webFilterToJobFilters()`, runs one query per filter, deduplicates by job ID, writes to job feed Notion DB. 10 jobs per filter query (no pagination on this endpoint). Annotates jobs with proposal URL when already applied.
  3. **Work diary** (`fetchContractDays`): 3-step approach — writes one row per work session (consecutive 10-min cells, gap > 10 min = new session) to `NOTION_DIARY_DATABASE_ID`
- `contractList` / `vendorContracts` permanently blocked (Upwork partner API scope). Workaround: use `talentWorkHistory` for active contract IDs.
- **3 Notion databases** wired up (env vars set locally + Vercel):
  - `NOTION_JOB_FEED_DATABASE_ID` — filtered job results (output)
  - ~~`NOTION_JOB_FILTERS_DATABASE_ID`~~ — no longer used
  - `NOTION_DIARY_DATABASE_ID` — per-day work diary rows
- Notion client pinned to API version `2022-06-28` (SDK default `2025-09-03` removed the `databases/query` endpoint)
- Job feed filters: human-readable multi-select labels in Notion → numeric Upwork IDs via `CATEGORY_ID_MAP` / `SUBCATEGORY_ID_MAP` in `upwork.ts`. 12 filter fields supported (skill, category, subcategory, job type, budget, experience level, verified payment, duration, workload, proposals cap, client hires/rating, flags)
- Hourly job rates stored as separate `Rate Min` and `Rate Max` Number fields in Notion Job Feed DB. `Value` field is fixed-price jobs only.
- Budget filter uses range overlap: keep hourly jobs where `rateMax >= filter.minBudget` AND `rateMin <= filter.maxBudget`. For fixed jobs, filter against `value` directly.
- Dashboard auto-refreshes settings every 15 seconds; last sync counter ticks in real time (seconds).
- API throttling: proposals fetched once per hour, work diary once per 10 minutes (timestamps stored in `last_proposals_sync_at`, `last_diary_sync_at` in `user_settings`). Required `NOTIFY pgrst, 'reload schema'` in Supabase after ALTER TABLE.
- `prev_sync_at` stored in `user_settings` to compute actual sync interval (shown in seconds on dashboard).
- Dashboard shows "Synced at HH:MM" toast after each cron-triggered sync (detected via polling `last_sync_at`).
- Dashboard shows active filter badges (from `web_filter` in `user_settings`) and a recent jobs table. The table lists all jobs fetched from Upwork (raw data), with badges showing what Notion did with each: `created`, `updated`, or `skipped` (upsert error). Stored in `last_sync_result.jobs.recentJobs`.
- Upwork job URLs fixed: use `ciphertext` field from GraphQL (e.g. `~022048894189896190929`), NOT numeric `id`. Numeric IDs return 404.
- Singleton token fallback removed from `getValidAccessToken` (security fix). Tokens are strictly per-user row.
- Cron interval changed to 2 minutes at cron-job.org to prevent overlapping syncs causing duplicate Notion pages.
- `filters_db_id` column dropped from Supabase `user_settings` table and removed from all code — was never read by the sync pipeline (filters DB comes from env var `NOTION_JOB_FILTERS_DATABASE_ID`).

### Web UI (as of 2026-07-31)

- **Settings page** (`/settings`): full-width `tabs tabs-box` daisyUI component. Two tabs: Upwork and Notion.
  - Upwork connected state: inline SVG logo + "Connected" badge + green circle reconnect button (tooltip: "Reconnect Upwork API"). Plain inputs, full-width `btn-soft btn-primary` Save button.
  - Upwork not-connected state: daisyUI `alert alert-vertical sm:alert-horizontal` instructions box, plain inputs, single "Save & Connect" button that saves credentials then immediately redirects to `/api/upwork/auth`.
  - Notion tab: same pattern. Notion logo from Figma (node 129:8161). Fields: Integration token, Job Feed DB ID, Work Diary DB ID (filters DB ID removed).
  - Both tabs: skeleton loading state while settings fetch.
- **Profile page** (`/profile`): Personal info (first name saved to `user_metadata`, read-only email), Change password, Danger zone with delete account modal. Delete uses `DELETE /api/user/delete` (service role admin delete). Full-width card layout matching settings page.
- **Dashboard** (`/dashboard`): Non-connected state replaced with full-width banner from Figma (node 140:8343). Background image (`/figma/dashboard-banner-616c12.png`) on the right. Stacks vertically on small screens (image on top, divider, text below). Shadow + rounded-[17px].
- **Sidebar**: gradient `linear-gradient(to bottom, #312E81, #0F0E1A)` replacing flat `#2F4F82`.
- **Figma assets**: downloaded to `public/figma/` — `upwork-logo.svg`, `notion-logo.svg`, `dashboard-banner-616c12.png`. Upwork and Notion logos are inline SVG components in `settings.tsx`.
- **Filters page**: "Verified Payment only" toggle uses daisyUI toggle with checkmark (enabled) / X (disabled) SVG icons.
