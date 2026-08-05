# Upwork API Scopes

## How scopes work

Upwork's API is a single endpoint used by both freelancers and clients. Scope names describe the **perspective**:

- **Vendor/Freelancer scopes** — your view as someone doing the work (proposals submitted, work diary, your profile)
- **Client scopes** — your view as someone hiring (jobs posted, proposals received, invitations sent)

A single Upwork account can be both. Since FreelanceLog is a freelancer tool, all client-side scopes are irrelevant.

## Scope decisions by version

| Scope | Status | Version | Reason |
|-------|--------|---------|--------|
| Activity Entities - Read-Only | ✅ keep | v1 | Work diary sync (`workDiaryContract`, `workDiaryTimeCells`) |
| Activity Entities - Read and Write | ❌ remove | — | Read-only is sufficient |
| Ad Credits and Connects | ✅ keep | v2 | Check Connects balance before submitting a proposal |
| List Invitation as client | ❌ remove | — | Client side — not relevant |
| Client Proposals - R/W | ❌ remove | — | Client side — not relevant |
| Common Entities - Read-Only | ✅ keep | v1 | Foundational — unlocks City, Country, Organization, User, Money fields everywhere |
| Common Functionality - R/W | ❌ remove | — | Read-only is sufficient |
| Contract Proposals - Read | ❌ remove | — | Not used |
| Contract - R/W | ❌ remove | — | Permanently blocked (requires Upwork partner API tier) |
| Freelancer Profile - R/W | ✅ keep | v3 | Freelancer profile snapshot (JSS, top-rated status). Read-only would suffice but harmless |
| Job Details - Read-Only | ✅ keep | v2 | Fetch full job details + screening questions before submitting proposal |
| Job Details - Write | ❌ remove | — | Client side — editing job postings, not relevant |
| Management Job Postings | ❌ remove | — | Client side — not relevant |
| Job Postings - Read / R+W | ❌ remove | — | Client side — not relevant |
| Organization - R/W | ❌ remove | — | Not needed |
| Read marketplace Job Postings | ✅ keep | v1 | Core job feed (`marketplaceJobPostingsSearch`) |
| Messaging - Read / R+W | ❌ remove | — | Not used |
| Offer - Read-Only | ✅ keep | v1 | Detect interview offers from clients |
| Offer - R/W | ❌ remove | — | No need to write offers |
| Ontology - Read-Only | ✅ keep | v1 | Category/subcategory taxonomy (currently hardcoded but useful as fallback) |
| Payments - R/W | ❌ skip | v3 | Earnings/transaction history — needs separate Upwork approval |
| Read public marketplace Job Postings | ❌ remove | — | Redundant — covered by authenticated marketplace scope |
| Scope to read snapshots - Public | ❌ remove | — | Not used |
| Submit Proposal | ✅ keep | v2 | Core proposal submission (`createJobProposal`) |
| Talent Profile - R/W public | ✅ keep | v1 | `vendorProposals`, `talentWorkHistory` |
| TimeSheet - Read-Only | ✅ keep | v1 | Work diary sync |
| Read transaction data | ❌ skip | v3 | Earnings feature — needs separate Upwork approval |
| View UserDetails | ✅ keep | v1 | `user { id nid rid ciphertext }` |
| Freelancer's Invitations - Read | ❌ remove | — | Not used |
| Freelancer's Invitations - R/W | ❌ remove | — | Not used |
| Read Work diary company | ❌ remove | — | Client side — employer view of freelancer's hours |

## Minimum scopes for v1

- Activity Entities - Read-Only
- Common Entities - Read-Only
- Read marketplace Job Postings
- Offer - Read-Only
- Ontology - Read-Only
- Talent Profile - R/W public
- TimeSheet - Read-Only
- View UserDetails

## Added for v2 (proposal submission)

- Ad Credits and Connects
- Job Details - Read-Only
- Submit Proposal

## Planned for v3 (earnings/profile)

- Freelancer Profile - R/W (read-only would suffice)
- Payments - R/W (requires separate Upwork approval)
- Read transaction data (requires separate Upwork approval)
