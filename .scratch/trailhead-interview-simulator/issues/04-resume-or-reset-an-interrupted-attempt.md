# 04: Resume an interrupted Attempt, or reset it

**What to build:** A Tenant who leaves an in-progress Attempt (closes the tab, navigates away) and
returns later continues from where they left off: the question they were mid-answering is
discarded, and their remaining time budget is exactly what it was when they left. If they'd rather
start fresh and have quota left, they can reset into a new Attempt instead of resuming.

**Blocked by:** 02.

**Status:** ready-for-review

- [ ] An Attempt's active-time budget accumulates only while it is open and in progress — it does
      not keep counting down while the Tenant is away (active-time accounting, not a wall-clock
      deadline).
- [ ] Leaving mid-question and returning discards that question's in-progress, unsubmitted Answer;
      the Tenant resumes at the next unanswered question.
- [ ] Returning to an incomplete Attempt shows the same persisted question set, the Tenant's
      already-recorded Answers, and the remaining time budget picked up exactly where it was left.
- [ ] With quota remaining, the Tenant can reset: the incomplete Attempt is left behind and a new
      Attempt is started, reserving another quota unit.
- [ ] With no quota remaining, only resuming the existing incomplete Attempt is offered — reset is
      unavailable.
- [ ] An integration test covers resuming after a simulated interruption: the discarded in-progress
      Answer and the preserved remaining time.
- [ ] The UI is tested with `fetch` mocked, covering the resume entry point and the reset action's
      quota-gated availability.
