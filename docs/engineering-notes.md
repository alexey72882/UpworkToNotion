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
    teamOrgId: "540749103848333313"   # organization.id (see gotchas below) — NOT user.id
  }) { newProposalId status error }
}
```

The example above shows the required fields. The full `CreateJobProposalInput` (confirmed via introspection 2026-08-06) also accepts: `questions: [CreateProposalQuestion { question, answer }]` (screening-question answers — see below), `attachments`, `estimatedDuration`, `milestones: [CreateProposalMilestone]`, `boostBidAmount`, `occupationId`, `agencyOrgId`, `gitHubRepoLink`, `sri`, `umaTouched`, `umaThreadId`.

Key gotchas confirmed by testing:
- `oDeskUserID` = `nid` (username string `"alexkievua"`), NOT the numeric `rid` (`"6890346"`)
- `teamOrgId` = org ID `540749103848333313`, NOT user ID. **Fetch via top-level `organization { id }`** — the previously-used `vendorProposals { organization { id } }` path is now oauth-scope-blocked (`VendorProposalsConnection.organization` → "not enough oauth2 permissions"). `companySelector { items { title organizationId } }` also works and lists all orgs (Alexey has 2: personal `540749103848333313` + "WEB 2B" agency `723127517184872448`); top-level `organization { id }` returns the personal one.
- `jobReference` = numeric `id` from job search (e.g. `"2084364540816197571"`), NOT ciphertext (`~02...`)
- Permissions include "Grants access to submit proposal to jobs" — write access is confirmed working

**Screening questions (confirmed live 2026-08-06, read-only — no proposal submitted):**
- Fetch a single job's screening questions via `marketplaceJobPosting(id: "<numeric_id>")` → `contractorSelection { proposalRequirement { coverLetterRequired screeningQuestions { question sequenceNumber } } }`. `id` must be the **numeric** job id (same as `jobReference`); ciphertext `~02...` returns 404. `screeningQuestions` is `[]` when the job has none.
- Submit answers back via the `questions: [{ question, answer }]` field on `createJobProposal`.

**Job-feed search node — free client & job fields (confirmed live 2026-08-08 via introspection + live query):**

The feed query's node type is `MarketplaceJobPostingSearchResult` (`marketplaceJobPostingsSearch → …Connection → …Edge → node`). Everything below rides along with the **existing feed query — no extra API call**. A subset of these is now fetched + written to Notion (shipped 2026-08-08, commit 3557362 — see the Job Feed DB property table in CLAUDE.md); the rest remain available if wanted.

- **Client stats are available on the search node's `client` field** (type `MarketplaceJobPostingSearchClientInfo`) — this corrects an earlier assumption that client quality data was tier-blocked. The block only applies to the *detail* endpoint's client objects (`marketplaceJobPosting.ownership.company` → `403 view_client_company` denied; `clientCompanyPublic` has no stats). The **search** node's `client` is open and exposes:
  - `totalFeedback` (Float — the feedback score, e.g. `4.62`), `totalReviews`, `totalHires`, `totalPostedJobs`, `totalSpent { rawValue currency }`, `verificationStatus`, `location`, `lastContractTitle`, `hasFinancialPrivacy`, + org ids. All `0`/null for brand-new clients (genuine, not blocked).
  - `totalSpent` looks accurate on re-check (live values up to ~$746K observed); low-per-hire samples (e.g. 462 hires / $15K) are just low-spend clients, not a bug. Value is `Money.rawValue` (string) → parse to Number.
  - **Not available:** avg hourly rate paid and total hours are NOT on this object (UI computes avg = hourly-spend ÷ hours-billed, hours-weighted). Only derivable proxy is `totalSpent ÷ totalHires` = $/hire.
- **Other free node fields (live-confirmed returning data):** `skills { name prettyName }` (required skills), `totalApplicants` (competition — free here; needs a per-job call at the detail endpoint; confirmed populating, e.g. 11–41 on active jobs), `category`/`subcategory` (slugs), `engagementDuration { label }` (structured duration), `weeklyBudget`, `hourlyBudgetType`, `preferredFreelancerLocation` (**a `[String]` list of countries, not a scalar** — introspection collapses `[String]`→`String`; we join to a comma string for Notion) + `…Mandatory`, `premium`/`enterprise`, `freelancersToHire`, `renewedDateTime` (set when reposted), `freelancerClientRelation` (prior relationship, null if none).
- **Scope-blocked on the search node:** `occupations.occupationLabel` → `403`.
- **Net effect:** client quality, competition, skills, and location requirements are all Gate-1 free (filter before writing to Notion). The only per-job detail call still needed is **screening questions**.

### 0003 proposal submission — implementation (shipped 2026-08-07)

Full apply flow is live end-to-end. Identity values (`upwork_nid`, `upwork_org_id`, `upwork_person_id`) are captured at the OAuth callback (`{ user { id name nid } organization { id } }`) and stored in `user_settings`.

**Endpoints** (`src/lib/apply.ts` holds shared `runSubmit`; the HTTP route + MCP tool both use it):
- `POST /api/apply` `{ externalId, userId }` — submits the proposal, marks the row `Applied` + `Proposal link`. Spends Connects; `userId` required (never inferred); `createJobProposal` NOT retried (double-application risk); `markApplied` best-effort.

> **Update 2026-08-11:** the `prepare` step was removed entirely (`runPrepare`, `POST /api/apply/prepare`, `fetchJobScreening`, `setJobScreeningQuestions`). Screening questions are pre-populated into every Notion row by the sync, so nothing needs to fetch them on demand anymore.

**Model B — values live on the Notion Job Feed row** (both the user and the Notion agent can write them). Added properties: `Bid` (number), `Cover Letter` (rich text), `Screening Answers` (rich text), plus `Screening Questions` (rich text). Submit reads them. Fails closed on blank/≤0 Bid, blank Cover Letter, or answer-count ≠ question-count.

> **Update 2026-08-08:** `Screening Questions` is now **pre-populated by the sync for every job** (free via the search node's `job.contractorSelection.proposalRequirement`, shared `formatScreeningQuestions`) — so `prepare` is largely redundant (and later removed — see 2026-08-11 above). `Cover Letter Required` (checkbox) is also synced; `runSubmit` now only requires a cover letter when it's true (`props["Cover Letter Required"]?.checkbox ?? true` → absent column defaults to required = today's behavior). ~10% of jobs have `coverLetterRequired: false`, usually ones with screening questions. **Unverified:** whether `createJobProposal` accepts an empty cover letter when not required — confirmed only on first real submit. Questions/answers are parsed as a **numbered list inside one cell** (`1. …`, item runs until the next `N.` marker → multi-line answers OK); questions come from the `Screening Questions` cell the sync wrote, NOT a re-fetch (keeps answers aligned to what the human saw).

**MCP server** (`src/pages/api/mcp.ts`) — lets a Notion Custom Agent drive the flow. Live at **`https://freelancelog.com/api/mcp`** (prod custom domain). Tools: `submit_proposal` only. (`prepare_application` was removed 2026-08-11 — screening questions are pre-populated by the sync, so the agent no longer needs to fetch them from Upwork.) Auth: per-user `mcp_token` (bearer, `user_settings.mcp_token`) → resolves userId; server built **per request** (not a module singleton — that would cross-wire users). Stateless `@modelcontextprotocol/sdk` v1.30.0 `StreamableHTTPServerTransport` works in a Pages Router route: keep Next bodyParser on, pass `req.body` to `transport.handleRequest(req, res, req.body)`. Notion requires **Business/Enterprise** plan + admin enabling custom MCP servers. Token managed at the `/mcp` page (`POST /api/user/mcp-token`).

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
- Writing a Notion page property that doesn't exist on the DB fails the **entire** page write with `400 validation_error: "<Prop> is not a property that exists."` — and Notion reports only the **first** missing property, not all. So adding new `buildJobFeedProps` fields silently breaks every job upsert (all counted as `skipped` in the sync result) until the exact-named column exists on each user's DB. `upsertJobFeedItem` returns only `"created"|"updated"`; `skipped` in the sync counts thrown errors, so `skipped == fetched` = schema mismatch, not no-ops. Multiple `__type` in one introspection query → `BadFaithIntrospection` error (one per query).
- Upwork GraphQL introspection works, including type-level `__type(name: "...")` (confirmed 2026-08-06 — used to introspect `CreateJobProposalInput`, `MarketplaceProposalRequirements`, etc.). An earlier note claimed `__type(name:)` was restricted/returned null; that was inaccurate.
- **daisyUI `.card` black-outline flash on load (fixed 2026-08-16)**: daisyUI 5 ships a "selectable card" affordance — `.card:has(> :checked){ outline: 2px solid }` (color = `currentColor` = `--color-base-content` ≈ `#18181b`, `outline-offset: 2px`). On the Filters page, checked filter inputs are momentarily a *direct* child of the `.card` during the skeleton→content hydration swap, so the card flashes a black offset outline for one frame (steady state nests the inputs deeper, so `> :checked` no longer matches and it clears). We don't use selectable cards; fix is an unlayered override in `globals.css`: `.card:has(> :checked){ outline: none; }` (unlayered beats daisyUI's cascade-layer rule, no `!important`). Reproduce in isolation with a `.card` containing a direct-child `<input checked>`; nested/empty cases never trigger it.

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
