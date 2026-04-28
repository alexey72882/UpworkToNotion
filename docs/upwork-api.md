# Upwork GraphQL API Reference

> **Last updated:** 2026-04-28
> **Endpoint:** `https://api.upwork.com/graphql`
> **Total root queries discovered:** 67

## Authentication

OAuth 2.0 Bearer token, per user. Each user registers their own Upwork API app and provides Client Key + Secret via the Settings page. Tokens are stored per-user in the Supabase `upwork_tokens` table (keyed by `user_id`) and auto-refreshed via `getValidAccessToken()` when within 2 minutes of expiry.

Scopes are configured at app level in the Upwork Developer Portal — they **cannot** be passed as a URL param (`scope=` returns `invalid_scope`).

---

## 1. Confirmed Working

### `talentWorkHistory`
Active contracts for a freelancer. Used as workaround since `contractList` is scope-blocked.

```graphql
{
  talentWorkHistory(filter: { personId: "540749103839944704", status: [ACTIVE] }) {
    workHistoryList {
      contract {
        id
        title
        terms { hourlyRate fixedAmount jobType }
      }
    }
  }
}
```
- `terms.hourlyRate` and `terms.fixedAmount` are strings (not Money objects)
- `terms.jobType` enum: `HOURLY`, `FIXED`, `STIPEND`

---

### `workDays`
Returns dates with tracked time for given contract IDs within a date range.

```graphql
{
  workDays(workdaysInput: {
    contractIds: ["41815410"]
    timeRange: { rangeStart: "20260330", rangeEnd: "20260406" }
  }) {
    workDays
  }
}
```
- Date format: `yyyyMMdd` (input and output)
- Returns only days that have tracked time
- Supports multiple `contractIds` but returns a combined list — use GraphQL aliases to batch per-contract queries

---

### `workDiaryContract`
Returns 10-minute time cells for a specific contract on a specific date.

```graphql
{
  workDiaryContract(workDiaryContractInput: {
    contractId: "41815410"
    date: "20260403"
  }) {
    workDiaryTimeCells {
      cellDateTime { rawValue }
      memo
      manual
      overtime
      activityLevel
    }
    workDiaryMetadata {
      timezoneOffset
      archivingDateTime
    }
  }
}
```
- Each cell = **10 minutes**
- `activityLevel` = mouse/keyboard activity score (0–100)
- `manual` = true if manually added (not tracked by desktop app)
- Date format: `yyyyMMdd`
- Supports GraphQL alias batching — tested up to 12 aliases per request; use batches of 10

---

### `vendorProposals`
Proposals submitted by the freelancer.

```graphql
{
  vendorProposals(
    filter: { status_eq: Pending }
    sortAttribute: { field: CREATEDDATETIME, sortOrder: DESC }
    pagination: { first: 10 }
  ) {
    edges {
      node {
        id
        status { status }
        marketplaceJobPosting {
          id
          ciphertext
          content { title }
        }
        organization { name }
        terms {
          chargeRate { rawValue currency }
        }
        auditDetails {
          createdDateTime { rawValue }
          modifiedDateTime { rawValue }
        }
      }
    }
  }
}
```
- **Max 40 per page** — `first: 41+` returns VJCA-6 error
- Status values: `Pending`, `Activated`, `Accepted`, `Offered`, `Hired`, `Declined`, `Withdrawn`, `Archived`
- `marketplaceJobPosting.ciphertext` — use this to build the job URL (see quirks below)

---

### `marketplaceJobPostingsSearch`
Job feed search by skill/category filters.

```graphql
{
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: {
      skillExpression_eq: "UI UX Figma"
      jobType_eq: HOURLY
      experienceLevel_eq: EXPERT
      categoryIds_any: [531770282580668418]
      verifiedPaymentOnly_eq: true
    }
    searchType: USER_JOBS_SEARCH
  ) {
    edges {
      node {
        id
        ciphertext
        title
        description
        amount { rawValue currency }
        hourlyBudgetMin { rawValue }
        hourlyBudgetMax { rawValue }
        publishedDateTime
        client {
          location { country }
          totalReviews
          totalFeedback
        }
        experienceLevel
        totalApplicants
        applied
        engagement
      }
    }
  }
}
```
- **No pagination** — always returns ~10 results; no `pagination` argument exists
- Only accepts 3 arguments: `marketPlaceJobFilter`, `searchType`, `sortAttributes`
- `ciphertext` — use for job URL: `https://www.upwork.com/jobs/~<ciphertext>`. Numeric `id` returns 404.
- `applied: true` means you've already submitted a proposal
- `categoryIds_any` requires **numeric IDs** — text names silently return 0 results
- `budgetRange_eq` and `hourlyRate_eq` are silently ignored — budget filtering done client-side
- `workload_eq` returns 0 results regardless of value — removed from pipeline

---

### `talentProfile`
Freelancer profile aggregates (lifetime stats).

```graphql
{
  talentProfile(personId: "540749103839944704") {
    profiles {
      profileAggregates {
        totalEarnings
        totalJobs
        totalHourlyJobs
        totalFixedJobs
        topRatedStatus
        totalFeedback
        lastWorkedOn
      }
      personAvailability {
        capacity
      }
    }
  }
}
```
- `totalFeedback` is the Job Success Score equivalent (0–100)
- `topRatedStatus`: `"top_rated"`, `"top_rated_plus"`, or null
- No `totalHours` field — use `totalHourlyJobs` for job count

---

### `user`
Basic current user info. Used post-OAuth to auto-fetch and save `upwork_person_id`.

```graphql
{
  user {
    nid
    name
    email
    photoUrl
  }
}
```

---

## 2. Available — Not Yet Used

Confirmed in schema, likely accessible with current scopes.

### `contractDetails(id: ID!)`
Full contract details — richer than `talentWorkHistory`.

```graphql
{
  contractDetails(id: "41815410") {
    id
    title
    status
    startDate
    endDate
    deliveryModel
    terms {
      hourlyTerms { ... }
      fixedPriceTerms { ... }
    }
  }
}
```
- Arg is `id` (not `contractId`)
- Fields are flat — no nested `contract` wrapper
- `ContractTerms.hourlyTerms` returns a LIST, not a single object

### `user.contractTimeReport`
Time reports per contract by date range.

```graphql
{
  user {
    contractTimeReport(
      timeReportDate_bt: { rangeStart: "...", rangeEnd: "..." }
      pagination: { first: 10 }
    ) {
      edges { node { ... } }
    }
  }
}
```

### `snapshotsByContractId`
Work diary screenshots. Takes `SnapshotsByContractIdInput!` — fields not yet introspected.

### Messaging (`room`, `roomList`)
Full messaging system. `Room` has 35 fields including unread count, latest message, contract/proposal links.

### `ontologySkills` / `ontologyCategories`
Upwork skill and category taxonomy — useful for resolving category IDs.

### Reference data
`countries`, `languages`, `regions`, `timeZones`

---

## 3. Blocked — Elevated Scope Required

### `contractList` / `vendorContracts`
```
Error: "Authorization failed" — Partner API scope required
```
Full contract list. Requires Upwork Partner API access — not obtainable via the standard developer portal.
**Workaround:** use `talentWorkHistory(filter: { status: [ACTIVE] })`.

### `transactionHistory`
```
Error: "Authorization failed" — Payments scope required
```
Full earnings ledger with transaction amounts, types, dates, and payment status.

### `clientProposals` / `clientProposal`
Client-side only — not accessible from a freelancer account.

---

## 4. Quirks & Gotchas

| Issue | Detail |
|-------|--------|
| Job URLs | Use `ciphertext` field: `https://www.upwork.com/jobs/~<ciphertext>`. Numeric `id` returns 404. |
| `vendorProposals` page limit | `first: 41+` returns VJCA-6 error |
| `marketplaceJobPostingsSearch` | No pagination — hard cap of ~10 results per query |
| `budgetRange_eq` / `hourlyRate_eq` | Silently ignored — budget filtering done entirely client-side |
| `workload_eq` | Returns 0 results regardless of value — removed from pipeline |
| `categoryIds_any` | Must be numeric IDs — text names silently return 0 results |
| `experienceLevel_eq` | `ENTRY_LEVEL` (not `ENTRY`), `EXPERT` (not `EXPERT_LEVEL`) |
| OAuth `scope` param | Ignored — scopes configured at app level in developer portal only |
| Work diary dates | Format `yyyyMMdd` only — ISO strings fail silently |
| `workDays` output | Times in UTC — hours tracked late night local time may appear on next UTC day |
| `TalentContractTerms.hourlyRate` | Returns string, not Money object — parse with `Number()` |
| `ContractTerms.hourlyTerms` | Returns a LIST, not a single object |
| GraphQL alias batching | Use batches of 10 for diary queries (tested safe up to 12) |
| Notion SDK API version | Must pin to `2022-06-28` — default `2025-09-03` removed `databases/query` |
| Upwork introspection | `__type(name: "...")` returns null for most types; only `__schema { types { name } }` works |
