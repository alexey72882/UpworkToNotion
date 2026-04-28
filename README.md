# UpworkToNotion

Syncs Upwork job listings and work diary to Notion. Multi-tenant SaaS — each user brings their own Upwork API app and Notion workspace.

**Live at:** https://upwork-to-notion.vercel.app

---

## How it works

A cron job (cron-job.org, every 2 minutes) hits `/api/sync`, which runs three parallel tracks per user:

1. **Job feed** — reads active filters from Notion, queries Upwork `marketplaceJobPostingsSearch`, upserts matching jobs to the Notion Job Feed DB
2. **Proposals** — fetches submitted proposals (throttled: once/hour), cross-references with job feed to mark applied jobs
3. **Work diary** — queries `workDiaryContract` for active contracts (throttled: once/10 min), writes one Notion row per contract per work day

## Stack

Next.js 16 (Pages Router) · TypeScript · Supabase (Auth + storage) · Notion API · Upwork GraphQL API · Deployed on Vercel

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
npm run test      # Vitest
npm run build     # type-check + build
npm run lint
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `NOTION_TOKEN` | Notion integration token |
| `NOTION_JOB_FEED_DATABASE_ID` | Job feed output DB |
| `NOTION_JOB_FILTERS_DATABASE_ID` | Filter config DB (read-only) |
| `NOTION_DIARY_DATABASE_ID` | Work diary output DB |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `UPWORK_CLIENT_ID` | Upwork OAuth client ID |
| `UPWORK_CLIENT_SECRET` | Upwork OAuth client secret |
| `UPWORK_REDIRECT_URI` | OAuth callback URL |
| `UPWORK_PERSON_ID` | Freelancer's numeric Upwork user ID |
| `API_SECRET` | Bearer token for cron-triggered `/api/sync` |
| `LOG_LEVEL` | Pino log level (default: `info`) |

## Docs

- [`docs/progress.md`](docs/progress.md) — current live state, known limits, Phase 3 roadmap
- [`docs/phase2.md`](docs/phase2.md) — Phase 2 implementation record
- [`docs/upwork-api.md`](docs/upwork-api.md) — Upwork GraphQL API reference (working queries, blocked queries, quirks)
- [`specs/specs/0001-upwork-notion-v0.1.md`](specs/specs/0001-upwork-notion-v0.1.md) — original product spec
