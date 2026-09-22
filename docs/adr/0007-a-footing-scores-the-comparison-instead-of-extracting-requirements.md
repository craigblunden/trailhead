---
status: accepted
---

# A Footing scores the comparison instead of extracting Requirements

The headline ask of the original brief — *"if we see lots of requests for proof of work and none are
listed, highlight that"* — left the phase twice, and `docs/deferred.md` records why: it rests on a
Requirement/Evidence taxonomy with five questions nobody has answered (the Requirement types, strength,
what matching means, normalisation, and the schema handed to the model). None of those got easier by
waiting.

A **Footing** (`CONTEXT.md`) answers a smaller question and needs none of them. TypeSafe's `score`
primitive returns a position on ordered, descriptive levels, so the comparison between a posting and an
Application kit is **scored directly** — neither side is ever parsed into typed things. Five Footing
dimensions, five ordered level sets, one request.

This is deliberately the lesser feature. It ships instead of nothing, not instead of the gap analysis.

## Why

The thing that made this worth doing is not the score. It is that **a Footing dimension is a column**.
A Tenant whose proof-of-work dimension reads "Not there yet" across eleven active Jobs is the original
motivating sentence, available as a query over stored rows — no taxonomy, no normalisation, no "JS
versus JavaScript". `docs/deferred.md` says structured extraction *"existed largely to make the
portfolio pass a query rather than an inference call"*. A Footing gets that property without the
extraction, for the aggregate question, while giving up the per-Job one.

What it gives up is real and should not be papered over: Jev generates no text, so a Footing **cannot
say why**. There is no Gap, no citation, no quoted span. The mitigation is structural rather than
cosmetic — five dimensions each carrying their own band, so "Proof of work: Not there yet" tells the
Tenant where to look even though nothing tells them what to write. One overall band alone would have
been a number with no recourse, which is why there is never only one.

## Considered options

- **Redefine `Analysis` to mean a scored comparison.** Rejected: it spends the better name on the
  lesser feature and quietly deletes a deferred decision that was paused on purpose, twice. `Analysis`,
  `Requirement`, `Evidence` and `Gap` stay in `CONTEXT.md`, unamended, for when that work returns.
- **Do the extraction first, score later.** Rejected for now: it is the work that already stalled, and
  a Footing does not depend on it. If extraction ever lands, a Footing is not in its way — the two
  answer different questions about the same two documents.
- **Score the comparison and keep the two concepts apart.** Chosen. The cost is a glossary that has to
  hold `Analysis` and `Footing` apart forever, which `CONTEXT.md` now does explicitly.

## Consequences

- **A second AI sub-processor.** `README.md` and `docs/architecture.md` both currently describe one
  outbound AI call. TypeSafe receives extracted resume text, the job description, and cover-letter
  text — never the files, since Jev is text-only. Their privacy policy commits in writing that Input is
  not used for training and is not disclosed beyond their service providers; it names no retention
  period, and there is no DPA or sub-processor list. That gap is disclosed rather than guessed at.
- **A smaller injection surface than the letter writer.** `criteria` are fixed by us and `state` is
  pure data, with no generation and no tools, so the worst a hostile job description can do is nudge a
  level. It still gets `stripInvisible` treatment on the way in, for consistency rather than necessity.
- **Scored on the Tenant's act.** An automatic re-score on upload or description edit was rejected: a
  Document belongs to the Tenant rather than to any Job, so one revised resume would fan out across
  every Job carrying it; there is no queue; and `CONTEXT.md`'s `Stale` rule already says a stale result
  is never silently recomputed. The rule now covers a Footing and did not have to change to do it.
- **History, not replacement.** Unlike a `Draft` (ADR-0002), Footings accumulate and the newest is
  "the Footing". One extra row buys the only feedback loop the feature has — whether the rewritten
  resume actually scored better — and the volume is bounded by how often a human clicks.
- The overall band is **derived, never stored**, so changing the weights re-reads history correctly
  instead of leaving a number no formula explains.
- `Footing` and `FootingDimension` each need the `erase_my_account` migration (ADR-0004), as
  `erase_attempts` and `erase_practice_rounds` did.

## Why it is not a Limit

Every other model call in this codebase is bounded by a Limit, and `PLAN_LIMITS` says why: *"each one
is a paid model call, and 'unlimited' would be a bill with no ceiling."* ADR-0003 goes further — a
feature not meant for a Plan should be a **Limit of 0**, never a switch.

A Footing is on every Plan, with no Limit at all. That is a departure, and the reason is arithmetic:
Jev costs $0.042 per **million** input tokens with output free, so one Footing over a resume and a
posting is roughly $0.0002. A Tenant scoring thirty Jobs every week for a year costs about thirty
cents. The letters rationale does not transfer, and inventing a Limit to look consistent would have
gated something free behind a Plan that, today, is a row set by hand (ADR-0001) — there is no payment
path in this product.

- `PLAN_LIMITS` gains nothing. A Footing is not a Limit, so it is not in the set of numbers a Plan is.
- **A per-Tenant daily ceiling exists in the scoring path as a circuit breaker, not an entitlement.**
  It is never shown, never in the Plan comparison, and never upsells: it exists so that a re-score loop
  introduced by a bug costs cents and stops, and it guards a shared account-wide rate limit (1,200
  requests/minute, which TypeSafe says is *"adjusting dynamically"*).
- If a Footing ever stops being nearly free — a costlier model, a longer state, a cross-Job pass —
  this section is what has to be revisited, and ADR-0003's shape is waiting.
