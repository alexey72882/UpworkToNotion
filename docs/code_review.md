# Code Review — UpworkToNotion

**Date:** 2026-04-02
**Scope:** Full repository (`src/`, config files, CI, specs)
**Reviewer:** Claude (Opus 4.6)

---

## 1. Security

### 1.1 `/api/upwork/fetch` is an open proxy [HIGH]

**File:** `src/pages/api/upwork/fetch.ts:11`

The `path` query parameter is passed directly to `callUpwork()`, which prepends `https://www.upwork.com/api/v3/` unless the value already starts with `http`. A caller can supply `path=https://evil.com/steal` and the server will make an authenticated request (with the Upwork bearer token) to an arbitrary URL and return the response.

**Action:** Validate that `path` is a relative path (reject values starting with `http`), or restrict to an allowlist of known Upwork endpoints.

### 1.2 No auth on any API route [HIGH]

None of the API routes verify caller identity. Anyone who discovers the deployment URL can:
- Trigger `/api/sync` and `/api/upwork/sync-notion` to write to Notion.
- Call `/api/upwork/fetch?path=...` and `/api/upwork/gql` to query Upwork with stored credentials.
- Call `/api/notion/seed-applied` to create arbitrary demo rows.
- Initiate the OAuth flow via `/api/upwork/auth`.

**Action:** Add a shared secret check (e.g. `CRON_SECRET` header for Vercel cron, `Authorization: Bearer <secret>` for manual calls) to every route except `/api/ping`.

### 1.3 No CSRF / state verification on OAuth callback [MEDIUM]

**File:** `src/pages/api/upwork/auth.ts:18`, `src/pages/api/upwork/callback.ts:110`

`auth.ts` generates a `state` parameter but never persists it (no cookie, no session, no DB write). `callback.ts` never checks the incoming `state`. This makes the callback susceptible to CSRF-based token injection attacks.

**Action:** Store `state` in a short-lived cookie or Supabase row; verify it in `callback.ts` before exchanging the code.

### 1.4 `notion-debug.ts` is a no-op [LOW]

**File:** `src/pages/api/notion-debug.ts`

The README says this endpoint checks `databases.retrieve`, but the handler just returns `{ ok: true }` unconditionally. It provides no diagnostic value and may mislead operators into thinking the Notion connection is healthy.

**Action:** Either implement the actual database connectivity check or remove the endpoint.

---

## 2. Correctness

### 2.1 `/api/sync` ignores real data pipeline [HIGH]

**File:** `src/pages/api/sync.ts:32-38`

The main cron entry point hardcodes a single demo item. It does not call `fetchUpworkItems()`, the `callUpwork` client, or the GraphQL proxy. The Vercel cron runs this every 3 hours to no useful effect.

**Action:** Wire this route to the real Upwork fetching logic, validate with the Zod schema, then upsert to Notion.

### 2.2 Two competing Notion integration paths [MEDIUM]

There are two independent Notion write paths that use different env vars and different property schemas:

| Path | Env var for DB | Properties |
|------|---------------|------------|
| `src/lib/notion.ts` → `upsertToNotion()` | `NOTION_DATABASE_ID` | `Name`, `Stage`, `Type`, `External ID`, `Client`, `Value`, `Currency`, `Upwork Link`, `Created`, `Updated` |
| `src/pages/api/upwork/sync-notion.ts` → `notionCreate()` | `NOTION_DB_ID` | `Name`, `Status`, `Rate`, `UpworkId` |

These target different Notion schemas and use different env vars (`NOTION_DATABASE_ID` vs `NOTION_DB_ID`). `sync-notion.ts` also uses raw `fetch` instead of the SDK client.

**Action:** Consolidate to a single Notion write path. Use the `upsertToNotion()` function from `src/lib/notion.ts` everywhere, and settle on one env var name.

### 2.3 `notionSeed.ts` creates a third Notion client [LOW]

**File:** `src/lib/notionSeed.ts:3-5`

This file creates its own `Client` instance and resolves the database ID from both `NOTION_DATABASE_ID` and `NOTION_DB_ID`. This is a third independent Notion client alongside `src/lib/notion.ts` and `src/pages/api/upwork/sync-notion.ts`.

**Action:** Reuse the shared `notion` client from `src/lib/notion.ts`.

---

## 3. Reliability

### 3.1 Top-level `throw` in `notion.ts` and `supabase.ts` crashes cold starts [MEDIUM]

**Files:** `src/lib/notion.ts:5-6`, `src/lib/supabase.ts:6-8`

These files throw at the module level if env vars are missing. Any route that transitively imports them will fail on cold start — even routes like `/api/ping` that don't need Notion or Supabase (currently safe only because ping doesn't import them). If a new route accidentally imports a shared utility that imports one of these, the entire app crashes.

**Action:** Defer validation to first use (lazy init) or guard with a function that returns a clear error response instead of crashing the process.

### 3.2 Swallowed errors in `findPageIdByExternalId` [LOW]

**File:** `src/lib/notion.ts:57-71`

Both the primary query and the fallback silently catch all exceptions. If the Notion API returns a 401 (expired token) or 429 (rate limit), the upsert will create a duplicate page instead of surfacing the error.

**Action:** Only catch expected errors (e.g. property mismatch for the filter). Re-throw on auth errors and rate limits.

---

## 4. Architecture & Code Organization

### 4.1 Pages Router + App Router coexist [LOW]

The project has both `src/app/` (App Router with `layout.tsx`, `page.tsx`) and `src/pages/` (Pages Router with all API routes). The App Router side is the default Next.js boilerplate and serves no project purpose.

**Action:** Remove `src/app/layout.tsx` and `src/app/page.tsx` (keep `globals.css` only if used), or replace with an actual project landing page.

### 4.2 `_netcheck.ts` is a debug tool in production [LOW]

**File:** `src/pages/api/_netcheck.ts`

This endpoint makes outbound requests to `httpbin.org`, `google.com`, and the Upwork token endpoint. It's useful for debugging network issues on Vercel but should not be exposed in production.

**Action:** Gate behind an env check (e.g. only respond when `NODE_ENV !== "production"`) or remove.

### 4.3 Logger is defined but never used [LOW]

**File:** `src/lib/logger.ts`

The Pino logger is configured but no route or lib file imports it. All current logging uses `console.log` / `console.warn`.

**Action:** Either adopt the Pino logger throughout the codebase or remove `pino` and `pino-pretty` from dependencies.

---

## 5. Testing & CI

### 5.1 No tests [HIGH]

There are no test files, no test runner, and no test script in `package.json`. The Zod schemas, Notion upsert logic, and OAuth token refresh flow are all untested.

**Action:** Add a test framework (e.g. Vitest — works well with Next.js and TypeScript) and cover at minimum:
- Zod schema validation (`UpworkItem` with valid/invalid data)
- `buildProps` mapping in `notion.ts`
- `getValidAccessToken` refresh logic (mock Supabase + fetch)

### 5.2 No type-checking in CI [MEDIUM]

The only CI workflow is `spec-check.yml`, which verifies PR bodies link a spec. There is no `tsc --noEmit` or `npm run build` step, so type errors can be merged undetected.

**Action:** Add a CI job that runs `npm run build` (which invokes `tsc`) and `npm run lint`.

---

## 6. Configuration

### 6.1 `.next/` is committed to git [MEDIUM]

The `.gitignore` excludes `/.next/` but the glob results show `.next/dev/` files in the repo. This adds build artifacts, inflates the repo, and can cause stale cache issues.

**Action:** Run `git rm -r --cached .next` and verify `.gitignore` is catching it.

### 6.2 `vercel.json` cron schedule doesn't match README [LOW]

The README says cron runs "every three hours", but `vercel.json` has `"0 3 * * *"` which is once daily at 03:00 UTC.

**Action:** Update either the README or the cron schedule to match the intended behavior.

---

## Summary of Actions

| Priority | Action | Files |
|----------|--------|-------|
| HIGH | Close the open-proxy hole in `/api/upwork/fetch` | `src/pages/api/upwork/fetch.ts` |
| HIGH | Add authentication to all API routes | All `src/pages/api/**` |
| HIGH | Wire `/api/sync` to real Upwork data | `src/pages/api/sync.ts` |
| HIGH | Add a test framework and initial test suite | New `__tests__/` or `*.test.ts` files |
| MEDIUM | Verify OAuth `state` parameter | `auth.ts`, `callback.ts` |
| MEDIUM | Consolidate Notion write paths and env vars | `notion.ts`, `sync-notion.ts`, `notionSeed.ts` |
| MEDIUM | Defer env-var validation to avoid cold-start crashes | `notion.ts`, `supabase.ts` |
| MEDIUM | Add `build` + `lint` CI jobs | `.github/workflows/` |
| MEDIUM | Remove `.next/` from git tracking | `.next/`, `.gitignore` |
| LOW | Fix or remove `notion-debug.ts` | `src/pages/api/notion-debug.ts` |
| LOW | Remove boilerplate App Router files | `src/app/layout.tsx`, `src/app/page.tsx` |
| LOW | Gate or remove `_netcheck.ts` | `src/pages/api/_netcheck.ts` |
| LOW | Adopt Pino logger or remove it | `src/lib/logger.ts`, `package.json` |
| LOW | Fix cron schedule vs README mismatch | `vercel.json`, `README.md` |
