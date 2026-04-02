# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start local dev server (http://localhost:3000)
npm run build     # production build
npm run lint      # run ESLint
```

No test runner is configured yet.

## Architecture

**Stack:** Next.js 16 (Pages Router) + TypeScript, deployed serverless on Vercel. No test framework yet.

**Flow:** Vercel Cron → `/api/sync` → Upwork API → Zod validation → Supabase log → Notion upsert → Pino logs

### Key files

| Path | Purpose |
|------|---------|
| `src/pages/api/sync.ts` | Main cron entry point (GET only; Vercel calls this every 3 hours per `vercel.json`) |
| `src/pages/api/upwork/auth.ts` | Starts Upwork OAuth2 flow — redirects user to Upwork |
| `src/pages/api/upwork/callback.ts` | Receives OAuth code, exchanges for tokens with retry logic, saves to Supabase |
| `src/pages/api/upwork/fetch.ts` | Calls Upwork REST API via `callUpwork` helper |
| `src/pages/api/upwork/gql.ts` | Proxy to Upwork GraphQL endpoint (`https://api.upwork.com/graphql`) |
| `src/pages/api/upwork/sync-notion.ts` | Fetches Upwork contracts and writes them to Notion (direct fetch calls) |
| `src/lib/upworkToken.ts` | OAuth token lifecycle: load from Supabase, auto-refresh when <2 min left |
| `src/lib/upworkClient.ts` | `callUpwork()` — authenticated REST wrapper using `getValidAccessToken` |
| `src/lib/notion.ts` | `upsertToNotion()` — find-or-create Notion pages keyed on `External ID` |
| `src/lib/supabase.ts` | Supabase client (service role, no session persistence) |
| `src/lib/upwork.ts` | Zod schema for `UpworkItem`; stub `fetchUpworkItems()` (TODO: replace) |
| `src/lib/logger.ts` | Pino logger; pretty-prints in dev, JSON in prod |

### OAuth token storage

Upwork OAuth tokens are stored as a **singleton row** (`id = "singleton"`) in the Supabase `upwork_tokens` table. `getValidAccessToken()` transparently refreshes when expiry is within 2 minutes.

### Notion upsert

`upsertToNotion()` queries the Notion database by the `External ID` rich-text property to detect existing pages, then either updates or creates. Uses `notion.request()` directly for the query to stay compatible with SDK v5.

### Upwork API access

- REST calls go through `callUpwork(path)` in `src/lib/upworkClient.ts`.
- GraphQL calls are proxied through `/api/upwork/gql` (POST `{query, variables}`).
- Base URL for REST: `https://www.upwork.com/api/v3/`.

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

## PR requirements

Every PR body must include a spec link matching `specs/[0-9]{4}-` — the `spec-check` CI job enforces this. Use the PR template in `.github/pull_request_template.md`.

## Spec

The product spec lives in `specs/specs/0001-upwork-notion-v0.1.md`. Implementation is still at the stub/scaffold stage — `fetchUpworkItems()` and `/api/sync` use demo data pending real Upwork integration.
