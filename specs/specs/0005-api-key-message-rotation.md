# 0005 — Per-user Upwork API-key request message

## Problem

Settings → Integrations → Upwork → Step 1 hands every user the same one-sentence blurb to paste
into Upwork's API-key application form. Once freelancelog has more than a handful of users,
Upwork's reviewers see byte-identical applications arriving repeatedly — a reason to reject them.

## Rule

Ten hand-written paraphrases live in `src/lib/apiKeyMessages.ts` (copy source:
`docs/API key request message.md`). Each user gets one, round-robin by claim order: the 11th
claimer gets message #1.

**Assignment is permanent.** The *resolved index* is stored on `user_settings`, not the sequence
number, so growing the list from 10 to 20 later only affects users assigned after the expansion —
nobody's text changes after they've already pasted it into Upwork. `messageIndexForSeq()` runs at
allocation only; the read path uses `messageForIndex()`.

**Assignment happens on first settings-page view**, not at registration. Ordering therefore
follows first-settings-view rather than strict signup order; a user who never opens settings
consumes no slot.

## Schema

Applied by hand in the Supabase dashboard (no migration system in this repo):

```sql
alter table user_settings add column api_key_message_index int;
create sequence api_key_message_seq;
create function public.next_api_key_message_seq() returns bigint
  language sql as $$ select nextval('api_key_message_seq') $$;
notify pgrst, 'reload schema';
```

A real sequence rather than `select count(*)` so two concurrent claims can't land on the same
slot. PostgREST can't call `nextval` directly, hence the wrapper function.

## Implementation

| File | Role |
|---|---|
| `src/lib/apiKeyMessages.ts` | the 10 variants, `messageIndexForSeq`, `messageForIndex` |
| `src/lib/apiKeyMessage.ts` | `assignMessageIndex(userId)` — idempotent claim, mirrors `callbackPool.ts` |
| `src/pages/api/user/settings.ts` | GET assigns if unset, returns `api_key_message` text |
| `src/pages/settings.tsx` | renders it multi-line (`whitespace-pre-line`) with the copy button |

`api_key_message_index` is server-assigned only — readable via GET, not in the PATCH allowlist.

## Future

The list is expected to grow past 10 if the product scales. Appending entries is safe and needs
no data migration.
