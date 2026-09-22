# 03: Running out of time costs less

**What to build:** A Tenant who runs out of time is no longer marked as if they gave empty answers. What
they had half-said when the clock hit zero is kept and scored; the questions they never reached are
shown as "Not reached" and count as nothing at half weight, so the overall reflects being cut off
without halving the score.

See `spec.md` → Scoring and time, and the **Unreached question** entry in `CONTEXT.md`.

**Blocked by:** 02 (Not reached rows sit where the star display goes)

**Status:** ready-for-review

- [ ] When the countdown reaches zero, non-empty typed or transcribed text on the current question is
      recorded as its Answer before the Attempt ends; empty text records nothing.
- [ ] Scoring sends only questions with a recorded Answer to Claude. Unreached questions get a score
      of 0 and no rationale from the app, with no call made about them. An Attempt where every question
      was unreached is scored without calling Claude at all.
- [ ] A question the Tenant reached and submitted empty while time remained is still sent and scored at
      full weight.
- [ ] Rollups weight unreached questions at half: five questions, three answered at 80, two unreached
      → overall 60. Category rollups use the same rule. Unit-tested, including all-unreached and
      none-unreached.
- [ ] The stored overall score matches the rollup.
- [ ] The Scorecard shows an unreached question as "Not reached" with no stars and no rationale, and a
      Category whose questions were all unreached as "Not reached".
- [ ] Attempts scored before this ticket recompute their rollups the same way on read — a question with
      no Answer recorded is unreached — with no re-scoring call.
- [ ] Tests: the time-up path records a partial answer (route and component), the scoring
      orchestration skips unreached questions (against the fake Claude server), and an end-to-end run
      that lets the clock expire shows "Not reached".
