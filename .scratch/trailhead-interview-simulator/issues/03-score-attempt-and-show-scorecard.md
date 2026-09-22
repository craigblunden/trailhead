# 03: Score a completed Attempt and show the Scorecard

**What to build:** Once an Attempt is complete (ticket 02), the Tenant can have it scored and see
a Scorecard: a score and short rationale for each Answer, rolled up per Category and into one
overall score, so the Tenant understands why it was marked as it was.

**Blocked by:** 02.

**Status:** ready-for-review

- [ ] Scoring a completed Attempt sends its questions and their Answers to the scoring Anthropic
      call and receives a score plus rationale for each Answer.
- [ ] Scores roll up into a per-Category average and one overall score, persisted against the
      Attempt and its Answers.
- [ ] An Attempt that is not yet complete cannot be scored.
- [ ] The Scorecard UI shows, per Answer, its score and rationale, grouped by Category with each
      Category's rollup, and the overall score.
- [ ] The scoring Anthropic-call module is tested against the local fake HTTP server, covering a
      successful score, a malformed/truncated response, and a refusal — the same hardened,
      schema-constrained shape as the question-generation call in ticket 01.
- [ ] The score Route Handler is tested with the orchestration layer mocked, covering each outcome.
- [ ] The Scorecard component is tested with `fetch` mocked.
