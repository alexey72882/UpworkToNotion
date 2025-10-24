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