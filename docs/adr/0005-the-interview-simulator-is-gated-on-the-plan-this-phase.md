---
status: accepted
---

# The Interview Simulator is gated on the Plan this phase, not on a Limit of 0

ADR-0003 proposed that a `pro`-only feature should be expressed as a **Limit** set to 0 on the
Plans that do not get it, so "a Plan is only a set of numbers" (ADR-0001, `CONTEXT.md`) keeps
holding and no gate learns a second shape. The Interview Simulator, as shipped, does not follow
that: `src/lib/interview.ts` exports `INTERVIEW_PLAN` and `canStartAttempt(plan)`, and
`src/server/interview/start-attempt.ts` refuses anything but `pro` with a `not-pro` outcome — which
is the "yes/no feature on the Plan" option ADR-0003 considered and rejected.

This records that departure rather than leaving it in a code comment, and says when it ends.

## Why

The spec's Limits table gives `free` **1** Attempt a week and `basic` **3** — real numbers, meant to
be real entitlements later — while its Out of Scope section is explicit that they are not this
effort's work:

> Real, working entitlements for `free` and `basic` — this effort ships the locked preview only for
> those Plans; enforcing their smaller real Limits is a later effort once the `pro` flow is proven.

So there are two different facts to state, and only one of them is a number:

- **What these Plans are meant to get** — 1 and 3 Attempts a week. Recorded in `PLAN_LIMITS`, where
  every other Limit lives.
- **What they can do today** — nothing, because the flow behind it is unproven.

A Limit of 0 collapses the two and states the first one falsely: it would say `free` is *entitled to
zero* interviews, which is not what was decided. The Plan check says the true thing — this feature
is not shipped for these Plans yet — and it is deliberately the kind of check that is awkward to
leave lying around, so it argues for its own removal.

## Considered options

- **A Limit of 0, per ADR-0003.** Rejected for now: it would overwrite the recorded 1 and 3, and the
  numbers would have to be reinstated from the spec when entitlements land, by someone who may not
  know they were ever decided.
- **Leave `PLAN_LIMITS` without interview numbers until entitlements land.** Rejected: interview
  simulator ticket 01 asks for them (`Limits`/`PLAN_LIMITS` carry an interviews-per-week number per
  Plan), and the account page's Plan comparison reads every number from `PLAN_LIMITS`, so a Plan
  with nothing recorded shows a blank where a promise should be.
- **The Plan check, recorded as temporary.** Chosen.

## Consequences

- `PLAN_LIMITS.free.interviewsPerWeek` and `.basic` are currently unreachable: no code path consults
  them, because `canStartAttempt` refuses first. They are a record of intent, not an enforced rule,
  and `tests/lib/interview.test.ts` (IV-4, IV-5) pins both facts side by side so neither is lost.
- **This ADR ends when the entitlements effort lands.** That effort deletes `INTERVIEW_PLAN` and
  `canStartAttempt`, lets the reservation's existing Limit check do the gating — `reserveAttempt`
  already refuses at the Limit, and would refuse a Tenant at 1 or 3 exactly as it refuses `pro` at 10
  — and the UI's locked state keys off `remaining === 0` instead. ADR-0003's shape then holds
  everywhere, and this document becomes history.
- The locked preview shows no quota line, because the Tenant's real remaining count is not something
  they can spend: "1 interview left this week" under "this is a Pro feature" would promise exactly
  the entitlement this ADR says is not yet real.
- ADR-0003 is still `proposed` and unamended. This is not an argument against it — its reasoning
  about the Portfolio and Outcome reviews stands, and those have no already-decided numbers to
  contradict.
