# Upwork GraphQL API — Available Data Types

Discovered via `/api/upwork/gql-introspect`. All queries go to `https://api.upwork.com/graphql`.

---

## Your Proposals (`vendorProposals`)

Jobs you've applied to. Filtered by status.

**Filter:** `status_eq` — `Pending | Activated | Accepted | Offered | Hired | Archived | Declined | Withdrawn`  
**Pagination:** max `first: 40`

| Field | Description |
|---|---|
| `id` | Proposal ID |
| `status.status` | Current lifecycle status |
| `marketplaceJobPosting.content.title` | Job title |
| `marketplaceJobPosting.id` | Job posting ID (used to build URL) |
| `organization.name` | Your org name (Alexey Ilyin) |
| `terms.chargeRate.rawValue` | Your proposed hourly rate |
| `terms.chargeRate.currency` | Currency (USD) |
| `auditDetails.createdDateTime.rawValue` | Proposal submitted (epoch ms) |
| `auditDetails.modifiedDateTime.rawValue` | Last modified (epoch ms) |

---

## Marketplace Job Listings (`marketplaceJobPostingsSearch`)

All public jobs on the platform. ~152k total. Can be filtered.

**Args:** `marketPlaceJobFilter`, `searchType: USER_JOBS_SEARCH`, `sortAttributes`  
**Filter fields:** `skillExpression_eq`, `categoryIds_any`, `occupationIds_any`, `jobType_eq`, `budgetRange_eq`, `hourlyRate_eq`, `verifiedPaymentOnly_eq`, `experienceLevel_eq`  
**Note:** No true personalized feed — approximate with skill expression filter

| Field | Description |
|---|---|
| `id` | Job posting ID |
| `title` | Job title |
| `description` | Full job description |
| `amount.rawValue` | Fixed price budget |
| `amount.currency` | Currency |
| `hourlyBudgetMin.rawValue` | Min hourly rate |
| `hourlyBudgetMax.rawValue` | Max hourly rate |
| `publishedDateTime` | When posted (ISO string) |
| `createdDateTime` | When created |
| `client.totalReviews` | Client review count |
| `client.totalFeedback` | Client feedback score |
| `client.location.country` | Client country |
| `skills` | Required skills |
| `category` / `subcategory` | Job category |
| `experienceLevel` | Entry / Intermediate / Expert |
| `totalApplicants` | Number of proposals received |
| `applied` | `true` if you've already applied |
| `engagement` | Hours per week expected |
| `weeklyBudget` | Weekly budget (for hourly contracts) |
| `relevance.hoursInactive` | Hours since last activity |

---

## Your Active Contracts (`contractList`, `vendorContracts`)

Active and past contracts (not proposals — actual hired work).

**`contractList`** — your contracts  
**`vendorContracts`** — searchable with filters

| Field | Description |
|---|---|
| `id` | Contract ID |
| `title` | Contract title |
| `status` | Active / Paused / Closed / etc. |
| `contractType` | Hourly / Fixed |
| `startDate` / `endDate` | Contract dates |
| `createDate` | When contract was created |
| `job` | Linked job posting |
| `freelancer` | Your user info |
| `clientOrganization.name` | Client company name |
| `clientTeam.name` | Client team |
| `terms.hourlyTerms` | Hourly rate terms |
| `terms.fixedPriceTerms.amount` | Fixed price amount |
| `milestones` | Milestones (for fixed price) |
| `feedback.clientFeedback.score` | Client's feedback score |
| `feedback.clientFeedback.comment` | Client's feedback text |

---

## Offers Received (`offersByAttributes`, `offersByAttribute`)

Offers made to you by clients (before you accept/decline).

| Field | Description |
|---|---|
| `id` | Offer ID |
| `title` | Offer title |
| `type` | Offer type |
| `state` | Current offer state |
| `client` | Client info |
| `freelancer` | Your info |
| `offerTerms` | Rate and terms |
| `lastUpdatedDateTime` | Last activity |
| `contract` | Linked contract (if accepted) |

---

## Your Profile (`user`, `freelancerProfile`)

Your Upwork profile and stats.

| Field | Description |
|---|---|
| `user.id` | Your user ID |
| `user.name` | Display name |
| `freelancerProfile.aggregates.jobSuccessScore` | JSS score |
| `freelancerProfile.aggregates.totalEarnings` | Total lifetime earnings |
| `freelancerProfile.aggregates.totalHours` | Total hours worked |
| `freelancerProfile.aggregates.totalFeedback` | Number of feedbacks |
| `freelancerProfile.aggregates.topRatedStatus` | Top Rated status |
| `freelancerProfile.aggregates.currentContracts` | Active contracts count |
| `freelancerProfile.aggregates.activeInterviews` | Active interviews count |
| `freelancerProfile.skills` | Your listed skills |
| `freelancerProfile.availability.capacity` | Availability hours/week |

---

## Work Diary (`workDiaryContract`, `workDays`)

Time tracking logs for hourly contracts.

| Field | Description |
|---|---|
| `workDays` | Daily work log entries |
| `Cell.timestamp` | Time entry timestamp |
| `Cell.manual` | Manual time (hours) |
| `Cell.overtime` | Overtime (hours) |
| `Cell.memo` | Work memo/description |

---

## Notifications / Messages (`roomList`, `room`)

Upwork messaging rooms (per contract or proposal).

| Field | Description |
|---|---|
| `room.id` | Room ID |
| `roomStories` | Message thread |
| `offerRoom` | Room tied to an offer |
| `contractRoom` | Room tied to a contract |
| `proposalRoom` | Room tied to a proposal |
