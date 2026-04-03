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

## Current status (as of 2026-04-02)

### What's done

- Full OAuth flow working (auth → callback → tokens saved to Supabase)
- New Supabase project provisioned (old one expired), `upwork_tokens` table created
- All env vars updated locally (`.env.local`) and on Vercel
- Upwork GraphQL schema discovered via `/api/upwork/gql-introspect`
- `fetchUpworkItems()` in `src/lib/upwork.ts` updated to use real Upwork GraphQL API:
  - Root query: `vendorProposals(filter, sortAttribute, pagination)`
  - Fetches active statuses: `Pending, Activated, Accepted, Offered, Hired` — 10 items each
  - Page size capped at **40** max (Upwork rejects `first > 40` with VJCA-6 error)
  - Maps real field paths: `marketplaceJobPosting.content.title`, `organization.name`, `terms.chargeRate`, `auditDetails.*.rawValue` (epoch ms)
- `mapStatus` / `mapType` updated to use actual Upwork status enum values
- All tests updated and passing (23 tests)
- **End-to-end sync verified**: Upwork → Zod → Notion working, items visible in Notion DB (`29671440d42e80b6bad5dd9c1a671a28`)
- **Deployed to Vercel**: production sync working, cron runs daily at 9am UTC (`0 9 * * *`)
- Next.js updated to 16.2.2 (CVE-2025-66478 fix required for Vercel deploy)

### Known quirks

- `vendorProposals` pagination limit is 40 (`first: 41+` returns VJCA-6 error, no pagination cursor yet)
- `sync.ts` response includes `fetched` count alongside `created/updated/skipped`
- `sync.ts` requires `export const config = { runtime: "nodejs" }` — without it the route may use edge runtime and behave differently

### What's next

- Expand statuses to include `Archived, Declined, Withdrawn` once ready for full history
- Add cursor-based pagination to fetch more than 10 per status (575+ Hired proposals exist)
- Improve Notion layout — views, filters, grouping by stage
- Consider notifications when proposal status changes


## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal.