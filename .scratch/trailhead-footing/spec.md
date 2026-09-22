# Footing: how securely a Tenant stands against one Job

**Status:** implemented

Settled in a grilling session on 2026-09-22. The glossary gained **Footing** and **Footing dimension**,
and **Stale** now covers both a Footing and an Analysis (`CONTEXT.md`). **ADR-0007** records why this
scores the comparison instead of extracting Requirements, and why it is on every Plan with no Limit.
The gap analysis in `docs/deferred.md` stays deferred and unamended.

Depends on the public disclosure pages from `.scratch/trailhead-terms/` (issues 01–02) being live before
this ships: it sends Tenant documents to a provider the product has never named.

## Problem Statement

A Tenant with thirty Jobs on the board has no way to tell which ones are worth an afternoon. Every card
looks alike, and the only signal the product gives is whatever they remember about the posting. The
information to answer it is already in the database — the job description on the Job, the resume and
cover letter in its Application kit — and nothing reads the two against each other.

The feature that was meant to is `docs/deferred.md`'s gap analysis, paused twice on the extraction
taxonomy it needs. Waiting has not made that taxonomy easier.

## Solution

A **Footing**: one TypeSafe request that scores a Job's posting against its Application kit across five
**Footing dimensions**, kept as history, shown on the job page. Five bands and one overall band, in the
words the Scorecard already uses. Never a percentage, never automatic, on every Plan.

It answers "is this worth my afternoon, and where am I weakest" and deliberately does not answer "what
should I add" — Jev generates no text, so a Footing can never say why.

## Decisions

### The five dimensions

Four describe the Tenant and make up the overall Footing:

| Dimension | The question it asks | Weight |
| --- | --- | --- |
| **Skills** | Does the resume show the specific skills the posting names? | 0.30 |
| **Experience** | Does its depth and seniority match what the posting asks for? | 0.30 |
| **Domain** | Does the industry, product and company context line up? | 0.20 |
| **Proof of work** | Are there shipped things, outcomes and evidence of doing, not just holding a title? | 0.20 |

The fifth, **Letter**, asks whether the attached cover letter makes the case this posting asks for. It
is shown beside the letter and is **never** in the overall: a letter can be rewritten in a minute, so
folding it in would let a rewrite raise a number that claims to be about the Tenant's history. It reads
the attached cover-letter **Document** only, never `Job.draft` — scoring a Draft means a number that
moves every time the Tenant presses Rewrite.

The weights are a starting guess and are commented as one. They live in `src/lib/footing.ts` and
nowhere else.

### The levels

- **Five levels per dimension**, ordered low to high, authored as *descriptions of situations* and never
  as degrees. "Names three of the five tools in the posting, with recent use" — not "moderately
  matched". This is TypeSafe's own guidance and it is also what makes the result legible.
- Five rather than four is arithmetic. Normalised through `scoreBand()`'s existing 80/60/40 thresholds,
  four levels put exact hits at 0 / 33 / 67 / 100, which leaves `developing` almost no territory and
  drops too much into the lowest band. Five land at 0 / 25 / 50 / 75 / 100 and give every band a home.
- Each level is an object with `what` and, where the model is likely to sit between two levels,
  `examples`. Field names are identical across the levels of one dimension.
- Normalise each returned score by `(levels − 1)` to 0–100, then band it with the **existing**
  `scoreBand()` and `SCORE_BAND_LABEL` from `src/lib/interview.ts`. No new band vocabulary: the same
  0–100 must not speak two languages in one app.

Worked example — **Proof of work**, the dimension the original brief was about:

0. No work described beyond job titles and responsibilities.
1. Describes duties in detail, but nothing said to have shipped or concluded.
2. Names things delivered, without scale, outcome or the Tenant's own part in them.
3. Names delivered work with the Tenant's part in it clear, or with an outcome attached.
4. Names delivered work with the Tenant's part, an outcome, and something a reader could go and look
   at — a link, a public artefact, a named product.

### How it is shown

- **Job detail page only.** Not the board: thirty cards each wearing a band word turns the board into a
  ranking, a column of "Not there yet" is the demoralising version of this feature, and the board's
  responsiveness rests on the list query in `components/jobs-provider.tsx` and `job-cache.ts`.
- The four dimensions and the overall band sit beside the Application kit; the Letter dimension sits
  beside the letter.
- **Never a bare number.** `CONTEXT.md` on the Scorecard: scores "are shown as stars with a band word,
  never as a bare number". The 0–100 is computed, banded, and never rendered.
- The overall band is **derived at read time, never stored**, so changing the weights re-reads history
  correctly instead of leaving a stored number no formula explains.

### When it happens

- **On the Tenant's act, never automatically.** One control on the job page, live once the Job has a
  description long enough to score and a resume in its Application kit.
- A Footing goes **stale** when the description or either Document's text changes. A stale Footing is
  still shown, with a line saying so, and is never silently recomputed — `CONTEXT.md`'s existing rule,
  which did not have to change to cover a Footing.
- Rejected: scoring on resume upload or description save. A Document belongs to the Tenant, not to a
  Job, so one revised resume attached to twenty Jobs would fan out across all twenty; there is no
  queue, so the model call would sit inside the save action, making description edits slow and a
  TypeSafe outage break saving; and it contradicts the `Stale` rule outright.

### Confidence

- Below the guard, there is no Footing at all: reuse `readinessOf()`'s existing refusal for a Job with
  no description or no resume, with its existing copy. A two-line job description is the real cause of
  a low-confidence score.
- Past the guard, a dimension whose `confidence` is below 0.4 is shown with its band and marked **not
  clear-cut**. It stays in the overall — dropping it silently would move the overall for a reason the
  Tenant cannot see. If mean confidence across the four is low, that is said once above the breakdown
  rather than five times inside it.

### Plans and bounds

- On **every** Plan. `PLAN_LIMITS` gains nothing and a Footing is not a Limit (**ADR-0007**).
- A per-Tenant **daily ceiling** guards the scoring path as a circuit breaker: never shown, never in the
  Plan comparison, never an upsell, logged when hit. It exists so a re-score loop from a bug costs cents
  and stops.

### The provider

- `@typesafe-ai/sdk`, server-side only, Node 20+. `TYPESAFE_API_KEY` read in one module and nowhere
  else, with a `footingAvailable()` guard mirroring `interviewAvailable()`: no key means the feature is
  **unavailable, not broken**.
- One request, five questions, one shared `state`. Jev evaluates them in parallel against it.
- Extracted `Document.text` only — Jev is text-only, so the PDF was never an option. State is truncated
  to a documented budget well inside Jev's 32k state limit.
- Model `jev-latest`. Input costs $0.042 per million tokens and output is free, so one Footing is
  roughly $0.0002.

## Out of Scope

- **Any cross-Job pass.** The Proof-of-work column is the point of the design (**ADR-0007**) and is a
  later effort with its own presentation. Nothing here aggregates.
- **Gaps, citations, and what to add.** A Footing cannot produce them. `docs/deferred.md` still owns
  that, and this closes none of its open questions.
- **A Footing on the board card**, and any ranking or sorting of Jobs by Footing.
- **Scoring `Job.draft`.** Only an attached cover-letter Document is ever scored.
- **Re-scoring on change.** Staleness is signalled; recomputation is the Tenant's act.
