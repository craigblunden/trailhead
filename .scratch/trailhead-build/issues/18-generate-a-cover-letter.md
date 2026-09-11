# 18: Generate a cover letter, under quota

**Status:** ready-for-review

**Blocked by:** 13, 15

## What to build

A user picks a resume on a job, presses generate, waits, and reads a cover letter written from their
resume and that job's description. They copy it. The disabled "Generate — coming soon" button becomes
real.

**The letter is not stored.** No Document, no versioning, no history. It is text with a
copy-to-clipboard control. Regenerating replaces what is on screen and leaves nothing behind.

**Generation is a POST Route Handler, not a Server Action.** Next dispatches Server Actions one at a
time per client, and generation takes tens of seconds — as an action it would head-of-line-block every
other mutation the user makes, including editing notes and changing a stage, for its whole duration.
This does not offend the rule that Server Actions are the only write path, because generation
persists nothing. It reads a Document and a Job through the data layer and returns text, and it
carries its own cross-user test.

**Read `claude-api` before writing the Claude call.** The model is `claude-opus-5` via
`@anthropic-ai/sdk`, server-side only — the key never reaches a browser.

**What the prompt actually receives is a decision this ticket makes.** Resume text plus job
description is the floor. Whether it also sees the job's notes, its company and role, or the contact
who referred the user is open, as are tone and length controls. Decide it, write down what you decided
and why, and keep the input assembly in one place so it can be changed without hunting.

**The quota ships in this ticket, not after it.** Generation is the application's only unbounded-cost
surface: exposed to anyone who signs up, re-runnable on demand, and roughly $0.18 an Opus call. A
signed-up stranger regenerating in a loop is an uncapped bill. Shipping generation first and the cap
second means a window in which that is true, and windows like that do not close on schedule.

The quota decisions to make and record:

- What the limit is, and over what window.
- Where the counter lives — it is tenant data, so it sits under RLS like everything else.
- **Whether a failed generation burns quota.** Decide deliberately; both answers are defensible and
  the wrong one is only discovered by a frustrated user.
- What the UI says at the limit, and whether that message differs for someone who has just discovered
  the feature and used it once.

**The waiting state is a design problem.** Ten to twenty-five seconds behind a pending state is what
ticket 13 designed for. Streaming the letter as it writes is deliberately deferred — a Route Handler
upgrades to streaming later without changing its callers, which is why it is a cheap improvement to
postpone rather than an oversight.

## Acceptance criteria

- [ ] A user generates a letter from a resume and a job description, reads it, and copies it
- [ ] Nothing is persisted by generation except the quota counter
- [ ] Generation runs as a POST Route Handler, and a long-running generation does not block the user
      from editing notes or changing a stage in another tab — driven as a test
- [ ] The Anthropic key is read server-side only and appears in no client bundle
- [ ] What the prompt receives is decided, recorded in this ticket, and assembled in one place
- [ ] The quota is enforced server-side, counted per tenant, stored under RLS, and cannot be bypassed
      by calling the route handler directly
- [ ] Whether a failed generation burns quota is decided and tested
- [ ] The at-quota state renders what ticket 13 designed, not a generic error
- [ ] A cross-user test proves user B cannot generate against user A's document or job
- [ ] The pending state is announced to assistive tech and does not rely on a spinner alone

## Comments

### 2026-09-11 — agent

**Built.** A user with a resume attached presses **Write cover letter**, waits, reads, copies.

- **Route Handler, not a Server Action:** `POST /api/jobs/:id/cover-letter`
  (`src/app/api/jobs/[id]/cover-letter/route.ts`, `maxDuration = 60`). In order: session → the job's
  inputs through the data layer (a foreign or missing job is 404 before any quota is touched; no
  usable resume is 409) → key configured or 503 → **reserve one letter** → the Claude call outside any
  transaction → on success return the letter; otherwise give the letter back and return the failure.
  The card calls it with `fetch`, never through an action.
- **Nothing is persisted but the counter.** No Document, no history: the letter is component state
  with a Copy button and a line saying it isn't saved. The integration test counts every other
  table before and after.
- **The Claude call** (`src/server/generation/cover-letter.ts`, `server-only`): `claude-opus-5` on
  the beta Messages endpoint with adaptive thinking, `output_config.effort: "medium"` (a letter needs
  judgement, not deep reasoning, and medium keeps the wait near the designed 10–25 s),
  `max_tokens: 16000`, `maxRetries: 0`, and a timeout of 55 s (lowered only by
  `GENERATION_TIMEOUT_MS`, for tests). **Server-side refusal fallbacks are on**:
  `betas: ["server-side-fallback-2026-07-01"]` with `fallbacks: "default"`, so a classifier decline
  is re-run on Anthropic's recommended fallback model inside the same call. Drop it if unwanted.
- **The key** is read in that one module. `e2e/bundle.spec.ts` builds with a marker key and asserts
  neither the key nor the string `ANTHROPIC` appears anywhere in `.next/static`.

**What the prompt receives — decided, and assembled only in `src/server/generation/prompt.ts`:**
the resume's extracted text, the job description, the company, and the role title, each fenced in
tags, with a system prompt that says the fenced text is material, not instructions. **Left out on
purpose:** the job's *notes* (private working notes — salary strategy, comparisons with other offers
— must never be able to reach an employer); *contacts*, including a referrer (naming someone is the
user's edit to make); salary, location, and stage. **No tone or length controls this phase:** a
fixed 250–400 words in a warm, direct voice; the user edits the result. Why each, in the module's
header.

**The quota — decided:**

| Question | Decision |
| --- | --- |
| Limit and window | **5 letters per user per week**, weeks starting **Monday, UTC** (`COVER_LETTER_QUOTA` in `src/lib/generation.ts`) |
| Where the counter lives | `GenerationQuota` (`userId`, `weekStart`, `used`), migration `20260911130000_generation_quota`: RLS enabled and forced, the same tenant policy as every table, added to ticket 04's isolation test |
| How it is enforced | One upsert inside `withTenant` whose `DO UPDATE` applies only while `used < 5`, so racing requests cannot overdraw it (7 concurrent reservations → exactly 5). The route reserves before calling Claude, so calling the handler directly meets the same rule |
| Does a failure burn quota? | **No. Only a delivered letter uses one up.** A refusal, an API error, a timeout, and a truncated letter all give the reservation back. Retrying is then free for the user; it is safe for the bill because nothing retries automatically, a refusal before output is not billed, and the user cannot induce the other failures |
| The at-quota message | The card, not an error: "You've used all 5 letters this week. Each one is written fresh by a paid AI model; your next 5 arrive Monday, Sep 14." The button is disabled; a letter already on screen stays copyable |
| Different for someone who just discovered it? | **No separate message.** The count ("5 of 5 left this week") and a one-line reason ("written by a paid AI model, so there are 5 a week") are on the card from the first visit, so the limit is known before it is met |

**The waiting state** is ticket 13's: one `role="status"` announcement ("Writing your cover letter.
This usually takes 10 to 25 seconds — you can keep editing this page."), a visible elapsed count that
is not read out on every tick, a skeleton, no fake steps, and no Cancel. The card also warns about a
short job description and says when no resume is attached or generation is unavailable.

**Tests.** `tests/server/cover-letter.test.ts` (9) runs the real SDK against a local fake of the
Messages API: the request body (model, thinking, effort, fallbacks and its beta header), the prompt's
inputs and exclusions, a refusal, a 529, a timeout, a truncation. `tests/integration/generation.test.ts`
(8): quota atomic under a race, the Monday rollover, per tenant and invisible to another tenant,
refunds never below zero; through the real route: a letter persists nothing else, the sixth request
is 429 and never reaches Claude, every failure refunds, user B gets A's 404 and takes no quota, no
resume is 409, no session is 401. `tests/components/cover-letter.test.tsx` (8, including axe in every
state). `e2e/generation.spec.ts` against `tests/fakes/anthropic-server.mjs`, which Playwright now
starts: **a five-second generation runs while another tab edits the notes and changes the stage;
both are read back committed while the letter is still being written**; then the letter arrives and
is copied from the real clipboard; and the at-quota state after five letters.

**Not verified: the live API.** No Anthropic key is available here, so every test uses the fake or a
local server. The request shape follows the bundled `claude-api` skill and type-checks against
`@anthropic-ai/sdk` 0.125.0; the first run against the hosted API is the smoke test — in particular
that `fallbacks: "default"` is accepted for this account.

**Status:** ready-for-review

### 2026-09-11 — agent (second review)

**Fixed, each with a test:**

- **The card could say "This didn't use one of your letters" when it had.** It inferred a refund from the error code, but the
  route's catch-all and a network failure also produce `failed`. The route now tracks its reservation through every exit, gives it
  back on any failure (a crash included), and returns `refunded` explicitly; the card believes only that. A letter already written
  is returned even if the quota cannot be read back afterwards.
- **The wait announcement arrived in a live region that appeared already holding its text**, which screen readers often skip. The
  region is now on the page from the start and filled when writing begins (GEN-U10).
- **The other-tab e2e test did not prove what it claimed**: Server Actions queue per page, so it would pass even if generation were
  an action. `generation.spec.ts` now also saves the notes on the same page while the letter is being written and requires that
  save's answer to arrive first.

**Still open for the user:** whether to keep the server-side refusal fallback (`fallbacks: "default"`), which the review flagged
against "The model is `claude-opus-5`".
