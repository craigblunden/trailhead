# 03: Scoring a Footing is the Tenant's act

**What to build:** The server path that scores one Job on request — the readiness guard, the daily
circuit breaker, the call, the insert — and the staleness check that reading a Job answers.

See `spec.md` → When it happens, Confidence, Plans and bounds. **ADR-0007** → Why it is not a Limit.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Refuse before spending anything when the Job has no resume in its Application kit or a
      description below the minimum length, reusing `readinessOf()` and `NOT_READY_LABEL` rather than
      inventing a second vocabulary for the same two refusals.
- [ ] A per-Tenant **daily** ceiling in this path. Not a Limit: nothing in `PLAN_LIMITS`, nothing on
      the Plan comparison, no upsell copy, no quota line in any response. Hitting it logs through
      `logEvent`/`logError` and returns a plain refusal.
- [ ] No Plan check anywhere in this path. Every Plan may score.
- [ ] Outcomes are mapped the way the interview routes do it: unavailable (no key), not-ready,
      rate-limited, failed, truncated, ok. A failure inserts nothing and costs the Tenant nothing.
- [ ] `isStale(footing, job)` compares the stored hashes and Document ids against the Job now. Reading
      a Job returns its newest Footing plus whether it is stale — never a recomputation.
- [ ] Tests: a Job with no resume is refused without a call; a malformed provider response inserts
      nothing; the ceiling refuses the next call and logs; changing the description makes the newest
      Footing stale without altering it; scoring twice leaves two rows.
