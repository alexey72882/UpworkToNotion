# 0001 – Upwork → Notion Kanban (v0.1)

**Status:** Draft  
**Owner:** @alexey72882  
**Linked Issues:** #1  
**Target Release:** v0.1

## Problem
Freelancers need a way to visualize all Upwork contracts and proposals in Notion without manual data entry.

## Goals
- Pull proposals, offers, and active contracts from Upwork.
- Map them to Notion cards with stages: Applied, Viewed, Interview, Hired.
- Enable drag‑and‑drop Kanban visualization.

## Non‑Goals
- No write‑back to Upwork.
- No multi‑user authentication yet.

## Data Model
| Field | Type | Notes |
|--------|------|-------|
| Name | title | Project title |
| Stage | select | Applied, Viewed, Interview, Hired |
| Type | select | Proposal, Offer, Contract |
| Client | text | Company or client name |
| Value | number | Contract value |
| Currency | select | USD, EUR, etc. |
| Upwork Link | URL | Job or contract link |
| Created | date | Start date |
| Updated | date | Last update |
| External ID | text | Upwork ID |

## Flow
Vercel Cron → `/api/sync` (Next.js API route) → Upwork API → Zod validation → Supabase log → Notion API upsert → Pino log

## Acceptance Criteria
- Each Upwork record appears as a unique Notion card.
- Re‑running sync updates existing cards (no duplicates).
- Cron runs every 3 hours successfully.
- Logs show run ID, counts, and duration.

---

## Roadmap

### Phase 1 — Personal tool (current)
Goal: fast iteration for a single user, validate the workflow.

- [x] Sync proposals to Notion (Applied → Hired stages)
- [x] Sync marketplace job feed (Lead stage)
- [x] Separate Notion DBs: filtered job feed + work diary (filters moved to Supabase `web_filter`)
- [x] Read search filters (now from `user_settings.web_filter` in Supabase, not a Notion DB)
- [x] Sync active contracts / work diary from Upwork

### Phase 2 — SaaS foundation
Goal: make it usable by other freelancers, charge monthly.

- [x] User auth (login / signup)
- [x] Per-user Upwork OAuth flow (each user connects their own account)
- [x] Per-user data isolation in Supabase (user_id on all tables)
- [ ] Stripe subscription billing (monthly plan)
- [x] Web UI to manage search filters (replaces Notion filters DB)
- [x] Dashboard: sync history, stats, last run status

### Phase 3 — Growth
- [ ] Multiple Upwork accounts per user
- [ ] Slack / email notifications on new matching jobs or status changes
- [ ] Custom Kanban view (no Notion dependency)
- [ ] Team / agency plans