# 01: Start an Attempt and see its generated questions

**What to build:** A `pro` Tenant can trigger starting an Attempt for a specific Job (a direct call
is fine here — the Job picker and nav entry points are ticket 07) and see a real, persisted Attempt
appear with questions spanning all five Categories, generated from that Job's description and the
Tenant's resume Document. Starting an Attempt consumes one of that week's quota units. This is the
foundation every other ticket builds on: schema, the real Anthropic call, and quota reservation, all
proven end to end before any interaction polish.

**Blocked by:** None (can start immediately).

**Status:** ready-for-review

Schema shape settled in the spec:

```
Attempt: jobId, length, startedAt, activeSeconds, completedAt, overallScore
AttemptQuestion: attemptId, category, order, text
InterviewQuota: userId, weekStart, used
Limits += interviewsPerWeek (free 1, basic 3, pro 10), pro's length choices (5, 10, 30 min)
```

- [ ] The `Attempt`, `AttemptQuestion`, and `InterviewQuota` models exist, and `Limits`/`PLAN_LIMITS`
      carry an interviews-per-week number per Plan and `pro`'s length choices.
- [ ] Starting an Attempt for a Job generates a question set spanning all five Categories
      (personal, behavioural, stakeholder, technical, design), personalised from that Job's
      description and the Tenant's resume Document text, and persists each question with its
      Category and order.
- [ ] Starting an Attempt reserves one unit of that week's `InterviewQuota` atomically before
      generation runs, and gives it back only if generation fails — never once a question set is
      delivered.
- [ ] A Tenant with no remaining weekly Attempts cannot start a new one; the failure is distinct
      from any other failure reason (out of quota, not a generation error).
- [ ] Reloading an existing Attempt shows exactly the questions originally generated — never
      regenerated.
- [ ] The Anthropic-call module is tested against a local fake HTTP server, covering a successful
      generation, a refusal, a timeout, and an overloaded response — mirroring the cover-letter
      writer's existing test.
- [ ] The reserve/give-back behaviour is covered by an integration test against a real database.
- [ ] The start Route Handler is tested with the orchestration layer mocked, covering each
      outcome's HTTP status/body mapping.
