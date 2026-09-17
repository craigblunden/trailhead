---
status: accepted
---

# A Practice round is stored in tables of its own, not as an Attempt without a Job

A **Practice round** (`CONTEXT.md`) runs on the same screen as an Attempt — one question at a time,
one countdown, spoken or typed, resumable — so the obvious way to store one is as an `Attempt` row
with a null `jobId` and a `kind` column. It is stored instead in its own `PracticeRound` and
`PracticeQuestion` tables, and shares only pure timing functions and the run screen with Attempts.

## Why

Nearly everything the code knows about an Attempt is false of a Practice round, and each of those
facts is currently enforced by nothing more than the shape of the data:

- **An Attempt belongs to a Job.** `Attempt.jobId` is required and cascades from `Job`; the hub's past
  interviews, a Job's latest Attempt, and repeat-question variety all join through it.
- **An Attempt is counted.** Starting one reserves from `InterviewQuota`; a Practice round is counted
  by no Limit.
- **An Attempt is scored.** The score route, the Scorecard, and the second-scored-Attempt feedback ask
  all read every completed Attempt as something to score; a Practice round is never scored.
- **An Attempt spans all five Categories.** A Practice round asks only personal and behavioural.

A `kind` column makes every one of those a filter that each existing and future query must remember.
Forgetting one is not a crash but a quiet wrong answer — a Practice round offered for scoring, counted
in "your second scored interview", or listed under a Job it has none of. Separate tables make those
mistakes unrepresentable, and leave the Attempt model and its tests exactly as they are.

## Considered options

- **`Attempt` with a nullable `jobId` and a `kind`.** Rejected for the reasons above; its one gain is
  reusing the answer route and data functions, which are small.
- **Not storing Practice rounds at all.** Rejected: keeping what was said is part of the decision
  (grilling session, 2026-09-17), and resuming needs a stored countdown.
- **Separate tables, shared pure logic.** Chosen. `remainingSeconds`, `nextQuestion`, `isComplete`
  and the run screen work over the fields both have (questions with an order and an Answer, a length,
  active seconds), not over `Attempt` itself.

## Consequences

- A Practice round gets its own routes (`/api/practice-rounds…`), data functions, row-level security
  policy, `postgres` grants, and a line in `erase_my_account()` (ADR-0004) — the same set every Tenant
  table carries.
- The answer and time-up rules are written twice, once per table. They are kept identical on purpose;
  the run screen cannot tell which it is driving.
- Practice questions store their text, not a reference into the question set, so editing or retiring a
  question never rewrites a round already taken.
- If a Practice round is ever made scorable or tied to a Job, this decision is worth revisiting — at
  that point it has become an Attempt.
