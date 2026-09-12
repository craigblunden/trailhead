# 03: The two Limit sites read the Plan

**Status:** ready-for-review
**Blocked by:** 02

## What to build

The upload cap and the weekly letter reservation take their Limit from the Tenant's Plan, and the
copy at both sites follows.

**Uploads** (`startUpload` in `src/server/data/documents.ts`): inside the existing advisory lock,
read the Tenant's Limits, and refuse with `cap-reached` only when `documents` is a number and
`held >= documents`. Unlimited skips the count. The refusal message names the Tenant's own number.

**Letters** (`reserveCoverLetter` in `src/server/data/generation.ts`): the upsert's `where
"used" < N` takes `N` from the Tenant's `lettersPerWeek`; when unlimited, the update has no
`where`. `generationQuota()` returns a `QuotaStatus` whose `limit` is the Tenant's Limit, so the
card can say "21 letters left this week" or, for unlimited, nothing about a count.

**The documents page and upload control** need the Limit alongside the count, so the documents
query (or the page's server prefetch) carries the Tenant's Limits. Copy for `pro` today (unlimited
documents):

- Header: "Your resumes and cover letters. Attach them to jobs from each job's page."
- Counter: "4 documents" in place of "4 of 3".
- The "All N slots used" state never renders; `roomLeft` returns null only for a finite Limit.

**The cover-letter card** keeps its copy; only the number changes. The "You've used all N letters
this week" paragraph renders for a finite Limit only.

## Decisions

- The Plan is read inside the same transaction as the check it guards, so a flip mid-upload is
  ordered with the count rather than racing it.
- A Tenant over a Limit after a downgrade sees the refusal on the next attempt and loses nothing.
  This is the existing behaviour of `held >= limit`; the test below pins it.
- The Route Handler and the generation module do not change shape. `QuotaStatus` is the only type
  that learns about unlimited.

## Seams under test

1. `tests/integration/documents.test.ts` — a `pro` Tenant uploads a fourth Document; a `free`
   Tenant holding four (moved back from `pro`) is refused and keeps all four.
2. `tests/integration/generation.test.ts` — a `pro` Tenant reserves a sixth letter in one week; a
   `free` Tenant with seven used is refused.
3. `tests/components/cover-letter.test.tsx` and the documents view tests — the copy above for
   finite and unlimited Limits.
