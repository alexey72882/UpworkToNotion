# 0003 – Proposal submission (v2)

**Status:** Planned
**Owner:** @alexey72882
**Depends on:** v1 read pipeline (multi-tenant) — see `specs/specs/0002-20-user-readiness.md`

## Product versioning context

**v1 — Read pipeline (multi-tenant)** ← current focus
The sync pipeline reads from Upwork and writes to Notion for every registered user. One cron run → loop over all users → run job feed + work diary per user. No write operations to Upwork.

Still to finish in v1:
- Multi-tenant sync scaling / fan-out (see `0002-20-user-readiness.md`).
- Onboarding flow for new users (connect Upwork + Notion, create DBs).

**v2 — Proposal submission** (this spec)
Add a proposal-submission API so a user (dashboard button) or a Notion AI agent can submit proposals to Upwork on the user's behalf.

Confirmed `createJobProposal` field values are documented in `docs/engineering-notes.md` → "Proposal submission — confirmed field values".

## Goal

User clicks "Apply" on a job in the dashboard → proposal submitted to Upwork via API → job marked Applied in Notion.

## Plan

### Step 1 — New API route: `POST /api/upwork/apply`

Body: `{ jobId: string, chargedAmount: number, coverLetter: string }`

- Look up userId from session (same pattern as `gql.ts`)
- Fetch `user.nid` and org ID (or store in `user_settings` — see Step 2)
- Call `createJobProposal` mutation with confirmed field values
- On success: mark the job as Applied in Notion (`Applied: true`, `Proposal link: "https://www.upwork.com/ab/proposals/<newProposalId>"`)
- Return `{ ok: true, proposalId }` or error

### Step 2 — Store org ID + nid in user_settings

Add `upwork_nid` and `upwork_org_id` columns to `user_settings` in Supabase. Populate them once at OAuth callback time (query `user { nid }` and `vendorProposals { organization { id } }` right after token exchange). This avoids hard-coding per-user values in code.

### Step 3 — Dashboard "Apply" button

In the recent jobs table, add an "Apply" button per row (only for jobs where `action !== "skipped"` and `applied !== true`). Clicking opens a small modal with:
- Cover letter textarea (pre-filled with template)
- Rate/bid input (pre-filled from job's rate range)
- Submit button

On submit: POST to `/api/upwork/apply`, show success/error toast, update the row badge to `applied`.

### Step 4 — Sync picks up the proposal

No extra work needed — the next cron run will call `vendorProposals` which will include the new proposal, and the job feed sync will annotate the Notion job page with `Applied: true` and the proposal URL.

## Core route: `POST /api/apply` (agent-facing)

Designed to be called by a Notion AI agent that has read access to the Job Feed DB. The agent reads `External ID` from the job page and passes it directly.

```json
// Request (Authorization: Bearer <API_SECRET>)
{ "externalId": "job-2084364540816197571", "chargedAmount": 50, "coverLetter": "..." }

// Response (success)
{ "ok": true, "proposalId": "2084370906841661441" }

// Response (error)
{ "ok": false, "error": "ALREADY_APPLIED" }
```

Server steps:
1. Strip `job-` prefix → numeric Upwork job ID
2. Call `createJobProposal` with confirmed field values
3. On success → find Notion page by `externalId`, set `Applied: true` + `Proposal link: https://www.upwork.com/ab/proposals/<proposalId>`
4. Return result

## Constraints

- `chargedAmount` for fixed-price jobs = total bid; for hourly = hourly rate
- Upwork requires questions to be answered if the job has screening questions — first version ignores them (proposal may fail with UNEXPECTED_ERROR in that case)
- Connects are spent on each application (Upwork deducts them server-side)
- `upwork_nid` and `upwork_org_id` should be stored in `user_settings` (populated at OAuth callback) rather than hard-coded
