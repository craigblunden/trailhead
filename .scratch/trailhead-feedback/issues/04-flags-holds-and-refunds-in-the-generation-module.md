# 04: Flags, Holds, refunds, and the route contract

**Status:** done
**Blocked by:** 01, 02, 03

## What to build

The generation module takes Feedback, places Flags, respects Holds, stores the Draft, and changes
what refunds. The Route Handler's contract grows to match. Order inside the module, which no caller
can get wrong:

1. Session. No client → `unavailable`.
2. Inputs, as today (`NotFoundError`, `no-resume`, `no-description`). With Feedback: the Job must
   have a Draft, else `no-draft` before any reservation.
3. **The deterministic check**: tag characters in Feedback → `hidden-feedback`. This counts as a
   Flag: upsert the week's row with `flagged + 1` and `used` unchanged, log `generation.flag` with
   source `hidden`, return the failure with `refunded: false`. Never reaches the reservation.
4. **Reservation**: the upsert's update applies only while `used` is below the Limit **and**
   `flagged < 2`. No row back → read the week's row to tell `held` from `quota`; `held` is its own
   `RuleError`.
5. The call, outside any transaction.
6. On a letter: one transaction stores the Draft (text, written-at now), writes the Activity entry
   ("Cover letter written" or "…rewritten"), and, if the verdict is `feedback`, increments
   `flagged`. Then log `generation.flag` with source `feedback` if it was. Return the letter, the
   verdict, `setAside`, and the quota status (now carrying `held` and `flags`).
7. On a failure: `failed`, `timed-out`, `truncated` refund as today. **`refused` no longer refunds.**
   A malformed response is `failed` and refunds. A crash after reserving still refunds.

**The quota status** gains `held: boolean` and `flags: number` for the week, read wherever the
status is read, so the card knows before anything is pressed.

**The route** parses an optional JSON body `{ feedback?: string }` with issue 02's schema (a bad body
is 400 with the failure shape, never a framework page). New failure codes and statuses: `held` 429,
`no-draft` 409, `hidden-feedback` 422. The success body adds `verdict` and `setAside`. The generation
failure messages gain the three codes' texts (the spec has them).

**The refund set** constant loses `refused`; the card's "this didn't use one of your letters" line
still reads the server's `refunded` alone.

## Acceptance criteria (through the real route, against the fake)

- [ ] A Rewrite stores the Draft, writes "Cover letter rewritten", costs one letter, and its prompt
      carried the previous Draft; a fresh write writes "Cover letter written" and replaces the Draft
- [ ] `verdict: feedback` delivers and counts the letter, sets `flagged` to 1, is not refunded, and
      logs one line without the text
- [ ] The second Flag in a week makes the next write `held` (429) before Claude is reached; the
      Draft is still readable; Monday clears it; a Tenant on Hold still edits notes and stages
- [ ] `material` and `set_aside` flag nothing and refund nothing
- [ ] Tag characters in Feedback: `hidden-feedback` (422), no letter used, `flagged` incremented,
      Claude never reached; two of them reach the Hold
- [ ] Feedback for a Job without a Draft: `no-draft` (409), nothing reserved
- [ ] A refusal leaves `used` incremented and `refunded: false`; `failed`, `timed-out`, `truncated`,
      and a malformed object each refund
- [ ] Another Tenant's Job with a Draft is the same not-found; `UserPlan` is never written; a
      counted-tables assertion shows only Job (Draft), ActivityEntry, and GenerationQuota change
- [ ] The boundary tests still pass (no new import crosses a layer)

## Comments

Done 2026-09-13. Order inside `generateCoverLetter`: session → `coverLetterSources` (adds the Draft;
`no-draft` when Feedback is given without one) → the tag-character check (`hidden-feedback`: a Flag
without a letter, via `flagWithoutLetter`, logged with source `hidden`) → `reserveCoverLetter` (the
upsert's update applies only below the Limit **and** `flagged < 2`; no row back is told apart as
`held` or `quota` by reading the week's row) → the call → `storeCoverLetter` (Draft, Activity entry,
and the Flag in one transaction) → `generation.flag` with source `feedback`. `REFUNDED_FAILURES` is
`failed`, `timed-out`, `truncated`. One decision beyond the ticket: a `feedback` verdict on a fresh
write (no Feedback to carry directions) is not believed against the user — no Flag, verdict `none`
(FB-6). The route reads an optional JSON body with the schema (400 in the card's shape otherwise) and
adds `held` 429, `no-draft` 409, `hidden-feedback` 422; the success body carries `verdict` and
`setAside`. `logEvent` was added to `src/server/log.ts` for the Flag line.
