# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start local dev server (http://localhost:3000)
npm run build     # production build
npm run lint      # run ESLint
npm run test      # run Vitest once
npm run test:watch # run Vitest in watch mode
```

## Architecture

**Stack:** Next.js 16 (Pages Router) + TypeScript, deployed serverless on Vercel. Tests via Vitest.

**Flow:** Vercel Cron → `/api/sync` → Upwork API → Zod validation → Supabase log → Notion upsert → Pino logs

### Key files

| Path | Purpose |
|------|---------|
| `src/pages/api/sync.ts` | Main cron entry point (GET only; Vercel calls this every 3 hours per `vercel.json`) |
| `src/pages/api/upwork/auth.ts` | Starts Upwork OAuth2 flow — redirects user to Upwork |
| `src/pages/api/upwork/callback.ts` | Receives OAuth code, exchanges for tokens with retry logic, saves to Supabase |
| `src/pages/api/upwork/fetch.ts` | Calls Upwork REST API via `callUpwork` helper |
| `src/pages/api/upwork/gql.ts` | Proxy to Upwork GraphQL endpoint (`https://api.upwork.com/graphql`) |
| `src/lib/upworkToken.ts` | OAuth token lifecycle: load from Supabase, auto-refresh when <2 min left |
| `src/lib/upworkClient.ts` | `callUpwork()` — authenticated REST wrapper using `getValidAccessToken` |
| `src/lib/notion.ts` | `upsertToNotion()` — find-or-create Notion pages keyed on `External ID` |
| `src/lib/supabase.ts` | `getSupabase()` — lazy-init Supabase client (service role, no session persistence) |
| `src/lib/upwork.ts` | Zod schema for `UpworkItem`; `fetchUpworkItems()` via Upwork GraphQL API |
| `src/lib/requireAuth.ts` | `requireAuth()` — API route guard checking `Authorization: Bearer <API_SECRET>` |
| `src/lib/logger.ts` | Pino logger; pretty-prints in dev, JSON in prod |

### OAuth token storage

Upwork OAuth tokens are stored as a **singleton row** (`id = "singleton"`) in the Supabase `upwork_tokens` table. `getValidAccessToken()` transparently refreshes when expiry is within 2 minutes.

### Notion upsert

`upsertToNotion()` queries the Notion database by the `External ID` rich-text property to detect existing pages, then either updates or creates. Uses `notion.request()` directly for the query to stay compatible with SDK v5.

### Notion databases

The app uses **3 separate Notion databases**. Each must be shared with the Notion integration (open the DB → top-right `...` → **Connections** → add your integration).

Get a database ID from its URL: `https://notion.so/workspace/`**`<32-char-hex>`**`?v=...`

#### 1. Filtered Job Feed (`NOTION_JOB_FEED_DATABASE_ID`)

Jobs fetched from Upwork marketplace matching your filters. App writes here.

| Property | Type |
|----------|------|
| `Name` | Title |
| `Description` | Rich text |
| `External ID` | Rich text |
| `Client` | Rich text (client country) |
| `Value` | Number |
| `Currency` | Select |
| `Created` | Date (published date) |

#### 2. Job Feed Filters (`NOTION_JOB_FILTERS_DATABASE_ID`)

Each row is a saved search. App reads this to know what to fetch from Upwork.

Property | Type | Notes |
|----------|------|-------|
| `Name` | Title | Label for the filter (e.g. "Figma UI") |
| `Skill Expression` | Rich text | Free-text skill query (e.g. `UI UX Figma`) |
| `Category IDs` | Rich text | Comma-separated category IDs |
| `Occupation IDs` | Rich text | Comma-separated occupation IDs |
| `Job Type` | Select | `Hourly` or `Fixed` |
| `Min Budget` | Number | Min fixed price or hourly rate |
| `Max Budget` | Number | Max fixed price or hourly rate |
| `Experience Level` | Select | `Entry`, `Intermediate`, or `Expert` |
| `Verified Payment Only` | Checkbox | Only clients with verified payment |
| `Active` | Checkbox | Uncheck to pause this filter |

#### 3. Active Contracts (`NOTION_CONTRACTS_DATABASE_ID`)

Your active Upwork contracts. App writes here.

| Property | Type |
|----------|------|
| `Name` | Title |
| `External ID` | Rich text |
| `Client` | Rich text |
| `Contract Type` | Select (`Hourly`, `Fixed`) |
| `Rate` | Number |
| `Currency` | Select |
| `Status` | Select (`Active`, `Paused`, `Closed`) |
| `Start Date` | Date |
| `Upwork Link` | URL |

#### Setting the env vars

**.env.local:**
```
NOTION_JOB_FEED_DATABASE_ID=<id>
NOTION_JOB_FILTERS_DATABASE_ID=<id>
NOTION_CONTRACTS_DATABASE_ID=<id>
```

**Vercel (production):**
```bash
npx vercel env add NOTION_JOB_FEED_DATABASE_ID production
npx vercel env add NOTION_JOB_FILTERS_DATABASE_ID production
npx vercel env add NOTION_CONTRACTS_DATABASE_ID production
npx vercel --prod
```

### Upwork API access

- REST calls go through `callUpwork(path)` in `src/lib/upworkClient.ts`.
- GraphQL calls are proxied through `/api/upwork/gql` (POST `{query, variables}`).
- Base URL for REST: `https://www.upwork.com/api/v3/`.
- The sync pipeline uses `vendorProposals` GraphQL query directly (not the proxy). Page size must be ≤ 40.

## Environment variables

| Variable | Used by |
|----------|---------|
| `NOTION_TOKEN` | Notion client auth |
| `NOTION_DATABASE_ID` | Target Notion database |
| `SUPABASE_URL` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase client |
| `UPWORK_CLIENT_ID` | OAuth flow |
| `UPWORK_CLIENT_SECRET` | OAuth token exchange & refresh |
| `UPWORK_REDIRECT_URI` | OAuth callback URL |
| `LOG_LEVEL` | Pino log level (default: `info`) |
| `API_SECRET` | Auth for protected API routes (`Authorization: Bearer <secret>`) |

## Testing after changes

After every incremental change, verify:

### API routes

```bash
# Health check — should always work, no env vars needed
curl -s http://localhost:3000/api/ping | jq .
# expect: {"ok":true,"service":"UpworkToNotion","version":"v0.1"}

# Notion connectivity (requires NOTION_TOKEN + NOTION_DATABASE_ID)
curl -s http://localhost:3000/api/notion-debug | jq .
# expect: {"ok":true,"title":"..."}

# Sync endpoint (requires API_SECRET + Notion + Supabase env vars)
curl -s -H "Authorization: Bearer $API_SECRET" http://localhost:3000/api/sync | jq .
# expect: {"ok":true,"created":...,"updated":...,"durationMs":...}

# Upwork fetch (requires API_SECRET + valid OAuth tokens in Supabase)
curl -s -H "Authorization: Bearer $API_SECRET" \
  'http://localhost:3000/api/upwork/fetch?path=contracts?limit=5' | jq .
# expect: {"ok":true,"url":"...","data":{...}}

# Upwork GraphQL proxy (requires API_SECRET + valid OAuth tokens)
curl -s -X POST http://localhost:3000/api/upwork/gql \
  -H "Authorization: Bearer $API_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ user { id name } }"}' | jq .
# expect: {"ok":true,"status":200,"data":{...}}

# Seed demo rows into Notion (requires API_SECRET + Notion env vars)
curl -s -H "Authorization: Bearer $API_SECRET" \
  'http://localhost:3000/api/notion/seed-applied?count=2' | jq .
# expect: {"ok":true,"created":2,"results":[...]}
```

### Build, lint & test

```bash
npm run test    # must exit 0 — runs Vitest
npm run build   # must exit 0 — catches type errors
npm run lint    # must exit 0
```

### OAuth flow

1. Open `http://localhost:3000/api/upwork/auth` in a browser — should redirect to Upwork.
2. After authorizing, Upwork redirects to the callback URL. Check the response for `{"ok":true,"saved":true}`.
3. Verify token was stored: query the `upwork_tokens` table in Supabase.

### Checklist for every change

1. `npm run test` passes
2. `npm run build` passes
3. `npm run lint` passes
4. `curl /api/ping` returns `{"ok":true}`
5. If you touched Notion code: `curl -H "Authorization: Bearer $API_SECRET" /api/sync` succeeds
6. If you touched Upwork code: `curl -H "Authorization: Bearer $API_SECRET" /api/upwork/fetch` returns data
7. If you touched OAuth code: run the full auth flow above

## PR requirements

Every PR body must include a spec link matching `specs/[0-9]{4}-` — the `spec-check` CI job enforces this. Use the PR template in `.github/pull_request_template.md`.

## Spec

The product spec lives in `specs/specs/0001-upwork-notion-v0.1.md`. The sync pipeline is fully wired up and working end-to-end.

## Current status (as of 2026-04-04)

### What's done

- Full OAuth flow working (auth → callback → tokens saved to Supabase)
- Upwork GraphQL schema discovered via `/api/upwork/gql-introspect`
- Sync pipeline restructured — proposals dropped, replaced with:
  - **Job feed** (`fetchJobFeed`): reads active filters from Notion filters DB, runs one query per filter, deduplicates by job ID, writes to job feed Notion DB. 10 jobs per filter query (no pagination on this endpoint).
  - **Contracts dropped**: `contractList` / `vendorContracts` require Upwork partner-level API access regardless of app permissions — blocked permanently unless Upwork grants access.
- **3 Notion databases** wired up (env vars set locally + Vercel):
  - `NOTION_JOB_FEED_DATABASE_ID` — filtered job results (output)
  - `NOTION_JOB_FILTERS_DATABASE_ID` — saved searches (input, read by app)
  - `NOTION_CONTRACTS_DATABASE_ID` — reserved for future use
- Notion client pinned to API version `2022-06-28` (SDK default `2025-09-03` removed the `databases/query` endpoint)
- Job feed filter field mappings discovered and fixed:
  - `jobType_eq`: `HOURLY` / `FIXED` (not `Hourly`/`Fixed`)
  - `budgetRange_eq`: `rangeStart` / `rangeEnd` (not `min`/`max`)
  - `experienceLevel_eq`: `EXPERT` / `INTERMEDIATE` / `ENTRY_LEVEL`
  - `categoryIds_any`: numeric IDs only — text names silently return 0 results
  - `Experience Level` in Notion is `multi_select` — only first value used (API accepts one)
- **End-to-end sync verified on production**: job feed fetching and writing to Notion
- Deployed to Vercel, cron runs daily at 9am UTC

### Work diary / freelancer profile — discovered, not yet built

The following data is accessible and ready to build:

**Active contract IDs** (needed for work diary):
```graphql
{ talentWorkHistory(filter: { personId: "<userId>", status: [ACTIVE] }) {
    workHistoryList { contract { id title status } }
} }
```
Returns numeric contract IDs (e.g. `41815410`) without needing contract scope.

**Work diary per contract per day** (hours, memos, activity):
```graphql
{ workDiaryContract(workDiaryContractInput: { contractId: "<id>", date: "20260403" }) {
    workDiaryTimeCells { cellDateTime { rawValue } memo manual overtime activityLevel }
} }
```
Each cell = 10 minutes. Date format: `yyyyMMdd`.

**Weekly hours across contracts**:
```graphql
{ workDays(workdaysInput: { contractIds: ["41815410"], timeRange: { rangeStart: "20260330", rangeEnd: "20260406" } }) {
    workDays
} }
```
Returns list of days with activity. Date format: `yyyyMMdd`.

**Freelancer profile aggregates** (lifetime stats):
```graphql
{ talentProfile(personId: "<userId>") {
    profiles { profileAggregates { totalEarnings totalHours totalJobs topRatedStatus totalFeedback lastWorkedOn } personAvailability { capacity } }
} }
```

**Weekly earnings**: blocked — requires Payments scope (`transactionHistory` returns "Authorization failed").

**User ID**: `540749103839944704` (Alexey)
**Organization ID**: `540749103848333313`

### Known quirks

- `vendorProposals` pagination limit is 40 (`first: 41+` returns VJCA-6 error)
- `marketplaceJobPostingsSearch` has no pagination — always returns 10 results per query
- Notion SDK v5 ships with API version `2025-09-03` which removed `databases/query` — must pass `notionVersion: "2022-06-28"` when creating the client
- Upwork OAuth scopes are configured at app level in developer portal, not via `scope` param in auth URL — passing `scope` returns `invalid_scope` error

### What's next

- Fetch active contract IDs via `talentWorkHistory` → query work diary for each → sync weekly hours to a Notion page or dashboard
- Freelancer profile snapshot (total earnings, JSS, top rated) → sync to Notion
- Improve Notion job feed layout — views, filters by experience level / budget
- Consider notifications when new matching jobs appear


## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal.