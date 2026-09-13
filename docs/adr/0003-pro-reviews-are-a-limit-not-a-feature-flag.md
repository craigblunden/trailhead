---
status: proposed
---

# Pro's reviews across many Jobs are a Limit, not a feature switch on the Plan

A later phase will give `pro` two passes across a Tenant's Jobs at once: the **Portfolio review**
(recurring Gaps between what active Jobs ask for and what the Documents show) and the **Outcome
review** (which resumes and cover letters go out with Jobs that reach interviewing or offer). Plans
are `free`, `basic`, and `pro`, and a Plan is only a set of Limits (`CONTEXT.md`, ADR-0001). We
propose to keep it that way: each review becomes a Limit — reviews per month — set to 0 on `free`
and `basic` and to a finite number on `pro`, gated the way Documents and letters already are. None
of this is built; this phase added `basic` and nothing else.

## Considered options

- **Yes/no features on the Plan** (`pro` has `portfolioReview: true`). Reads naturally, but a Plan
  stops being a set of numbers, every gate learns a second shape, and "how many" still has to be
  answered for a pass that costs model calls — so the count arrives anyway, beside the switch.
- **A Plan-independent trial**, the earlier "twice per user per month" idea from `docs/deferred.md`.
  Dropped: the reviews are what `pro` is for. A trial is still one number away — raise `basic`'s
  Limit from 0.

## Consequences

- Both reviews stay finite on every Plan, like letters: a Portfolio review is paid model calls, and
  "unlimited" would be a bill with no ceiling. The Outcome review reads Stages and Application kits
  alone, so it may earn a looser Limit — decide when it is built.
- A Limit of 0 is a real value: the UI can show the review as a `pro` feature (as the supporting
  documents preview does today) without a separate "is this Plan allowed" check.
- A Tenant moved down from `pro` keeps every stored review and cannot run another, as a Tenant over
  the Document Limit keeps its Documents.
- The Outcome review needs no Requirement/Evidence extraction and could ship before the Portfolio
  review. The Portfolio review inherits every open question in `docs/deferred.md` — the Requirement
  types, strength, matching, normalisation — and this ADR answers none of them.
