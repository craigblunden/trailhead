# 18: Generate a cover letter, under quota

**Status:** ready-for-agent

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
