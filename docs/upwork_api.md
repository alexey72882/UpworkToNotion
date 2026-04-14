# Upwork GraphQL API — Discovery Reference

> **Last updated:** 2026-04-09  
> **API endpoint:** `https://api.upwork.com/graphql`  
> **Total root queries discovered:** 67

---

## Authentication

OAuth 2.0 Bearer token. Scopes are set at app level in the Upwork Developer Portal — they **cannot** be passed as a URL param (`scope=` returns `invalid_scope`).

Token is stored as a singleton row in Supabase (`id = "singleton"`) and auto-refreshed via `getValidAccessToken()` when within 2 minutes of expiry.

---

## 1. Confirmed Working

These have been tested and return data in this project.

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
- Supports multiple `contractIds` but returns combined list — query one contract at a time to get per-contract results, or use GraphQL aliases to batch
- Returns only days that have tracked time

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
- Supports GraphQL alias batching (tested up to 12 aliases per request; use batches of 10 to be safe)

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
      budgetRange_eq: { rangeStart: 50, rangeEnd: 200 }
      categoryIds_any: [531770282580668418]
      verifiedPaymentOnly_eq: true
    }
    searchType: USER_JOBS_SEARCH
  ) {
    edges {
      node {
        id
        title
        description
        amount { rawValue currency }
        hourlyBudgetMax { rawValue }
        publishedDateTime
        client { location { country } }
        applied
      }
    }
  }
}
```
- **No pagination** — always returns ~10 results
- `applied: true` means you've already submitted a proposal — skip these
- `categoryIds_any` requires **numeric IDs** — text names silently return 0 results
- `experienceLevel_eq` values: `EXPERT`, `INTERMEDIATE`, `ENTRY_LEVEL`
- `jobType_eq` values: `HOURLY`, `FIXED`

---

### `talentProfile`
Freelancer profile aggregates (lifetime stats).

```graphql
{
  talentProfile(personId: "540749103839944704") {
    profiles {
      profileAggregates {
        totalEarnings       # Float — lifetime earnings in USD
        totalJobs           # Int — total contracts
        totalHourlyJobs     # Int
        totalFixedJobs      # Int
        topRatedStatus      # String: "top_rated", "top_rated_plus", null
        totalFeedback       # Float — JSS score (0–100)
        lastWorkedOn        # ISO datetime string
      }
      personAvailability {
        capacity            # "fullTime", "partTime", "asNeeded"
      }
    }
  }
}
```
- **Note:** no `totalHours` field — use `totalHourlyJobs` for job count
- `totalFeedback` is the Job Success Score equivalent

---

### `user`
Basic current user info.

```graphql
{
  user {
    nid       # username slug (e.g. "alexkievua")
    name      # display name
    email
    photoUrl
  }
}
```

---

## 2. Available — Not Yet Built

Confirmed to exist in the schema and likely accessible with current scopes, but not yet implemented.

### `contractDetails(id: ID!)`
Full contract details — richer than `talentWorkHistory`.

```graphql
{
  contractDetails(id: "41815410") {
    id
    title
    status          # ContractStatus enum
    startDate
    endDate
    createDate
    deliveryModel   # HOURLY, FIXED_PRICE, etc.
    kind            # enum
    job { ... }     # JobPosting
    freelancer { ... }
    clientOrganization { ... }
    vendorOrganization { ... }
    terms {
      hourlyTerms { ... }    # LIST of HourlyContractTerm
      fixedPriceTerms { ... }
      stipendTerms { ... }
    }
    hourlyLimits { ... }
    offer { ... }
  }
}
```
- Arg is `id` (not `contractId`)
- Fields are flat on the type — no nested `contract` wrapper

---

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
- Requires `timeReportDate_bt` (between date) argument
- `TimeReport` node fields not yet fully explored

---

### `snapshotsByContractId`
Work diary screenshots per contract.

```graphql
{
  snapshotsByContractId(input: { ... }) {
    # SnapshotsByContractIdInput — fields not yet explored
  }
}
```
- Takes `SnapshotsByContractIdInput!` — input fields not yet introspected
- Likely returns screenshot URLs and timestamps

---

### `room` / `roomList` / messaging
Full messaging system — rooms contain conversations.

```graphql
{
  roomList { ... }                    # List of rooms
  room(id: ID!) {
    id
    roomName
    roomType                          # enum
    contractId
    contractDetails { ... }          # linked ContractDetails
    vendorProposal { ... }           # linked proposal
    latestStory { ... }              # most recent message
    stories(pagination: { first: N }) {
      edges { node { ... } }
    }
    numUnread
    topic
    roomUsers { ... }
  }
  oneOnOneRoom(userId: ID!) { ... }
  contractRoom(contractId: ID!) { ... }
  proposalRoom(proposalId: ID!) { ... }
  offerRoom(offerId: ID!) { ... }
}
```
- `Room` has 35 fields including unread count, mute state, latest message
- Messages are `RoomStory` objects inside `stories` connection

---

### `offer` / `offersByAttributes`
Offer management.

```graphql
{
  offer(id: ID!) { ... }
  offersByAttribute(filter: <filter>!) { ... }
  offersByAttributes(filter: <filter>!) { ... }  # note: both singular and plural exist
}
```
- Filter types not yet fully introspected

---

### `publicMarketplaceJobPostingsSearch`
Same as `marketplaceJobPostingsSearch` but public (no auth required for basic queries).

---

### `freelancerProfileByProfileKey` / `freelancerProfileSearchRecords`
Public freelancer profile lookup.

---

### `ontologySkills` / `ontologyCategories` / `ontologyEntities`
Upwork skill and category taxonomy — useful for resolving category IDs for job search filters.

```graphql
{
  ontologyCategories { ... }
  ontologySkills { ... }
  ontologyEntities(ids: [...]) { ... }
}
```

---

### `workDiaryCompany`
Company-side view of work diary (if acting as client/agency).

---

### Reference data
```graphql
{ countries { ... } }
{ languages { ... } }
{ regions { ... } }
{ timeZones { ... } }
```

---

## 3. Blocked — Elevated Scope Required

These exist in the schema but return authorization errors with standard OAuth scopes.

### `contractList` / `vendorContracts`
```
Error: "Authorization failed" / Partner API scope required
```
Returns full contract list with terms, rates, and status. **Requires Upwork Partner API access** — not obtainable through the standard developer portal. Workaround: use `talentWorkHistory(filter: { status: [ACTIVE] })`.

---

### `transactionHistory`
```
Error: "Authorization failed" — Payments scope required
```
Would return full earnings ledger with rich fields:
- `transactionAmount` (Money)
- `amountCreditedToUser` (Money)
- `type` (string: "bonus", "payment", etc.)
- `description`
- `transactionCreationDate`
- `paymentStatus`
- `descriptionUI`
- `paymentGuaranteed` (Boolean)
- `assignmentDeveloperName`, `assignmentCompanyName`

---

### `clientProposals` / `clientProposal`
Client-side proposal management — not accessible from freelancer account.

---

## 4. Quirks & Gotchas

| Issue | Detail |
|-------|--------|
| `vendorProposals` page limit | `first: 41+` returns VJCA-6 error |
| `marketplaceJobPostingsSearch` | No pagination — always returns ~10 results per query |
| `categoryIds_any` | Must be numeric IDs — text names silently return 0 results |
| `experienceLevel_eq` | `ENTRY_LEVEL` (not `ENTRY`), `EXPERT` (not `EXPERT_LEVEL`) |
| `budgetRange_eq` | Uses `rangeStart`/`rangeEnd` (not `min`/`max`) |
| OAuth `scope` param | Ignored — scopes configured at app level in developer portal only |
| Work diary dates | Format `yyyyMMdd` only — ISO strings fail silently |
| `workDays` output | Times in UTC — hours tracked late night local time may appear on next UTC day |
| `TalentContractTerms.hourlyRate` | Returns string, not Money object — parse with `Number()` |
| `contractDetails` arg | `id` (not `contractId`) — fields are flat, no nested `contract` wrapper |
| `ContractTerms.hourlyTerms` | Returns a LIST (not a single object) |
| GraphQL alias batching | Tested up to 12 aliases per request safely; use batches of 10 for diary queries |
| Notion SDK API version | Must pin to `2022-06-28` — default `2025-09-03` removed `databases/query` |
