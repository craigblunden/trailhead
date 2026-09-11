# 02: Job rules return the whole new Job and the whole moved Job

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

The rules for how a Job changes are decided in pieces: the accent round-robin, the opening Activity entry's label, and the Stage-change calculation. Those pieces are then put together three times:

- in the data layer
- in the browser's optimistic update
- in the in-memory fixture client

A new Job's defaults are written out in full in all three places: Stage `interested`, dated today, no applied date, empty notes, an empty Application kit, no Contacts, and one opening Activity entry. Recording an Activity entry for a new kind of change would mean editing all three.

After this ticket, the rules module returns the **complete** new Job and the **complete** moved Job:

- The moved Job has its "Moved to …" Activity entry prepended.
- It has the applied-date backfill applied.
- Re-selecting the current Stage is a no-op.

The optimistic update and the fixture client use these results as they are. The data layer writes what they decide. The server still derives the change from what the database holds, so a divergence still shows up as a visible correction after the round trip.

## Acceptance criteria

- [x] New-Job defaults are written in one place. The data layer, the optimistic update, and the fixture client all take them from there.
- [x] A Stage move is decided in one place and used by all three: the new Stage, the applied-date backfill, and the prepended Activity entry.
- [x] The rules have direct unit tests:
  - re-selecting the current Stage changes nothing
  - leaving `interested` with no applied date backfills one
  - moving to `interested` never sets one
  - an existing applied date is never touched
- [x] Every existing board, job page, and integration test passes, and none changes what it asserts.

## Comments

### 2026-09-11 — agent

**Built, in `src/lib/jobs-rules.ts`.**

- **`newJobFacts(today, existingCount)`** holds everything a new Job is apart from what the user typed and its ids: Stage, dates, notes, an empty kit, no Contacts, the accent, and the opening entry.
- **`newJob(fields, { today, existingCount, newId })`** builds the whole Job for a store that holds Jobs in memory.
- **`movedJob(job, stage, today, newId)`** returns the whole moved Job, or the same Job for a re-selected Stage. `stageChange` remains the decision underneath it.

Who uses them:
- `createJob` writes `newJobFacts`, and `setJobStage` writes what `stageChange` decides from the database's row.
- The optimistic update uses `newJob` and `movedJob`. So does the fixture client, which is now the in-memory store of ticket 05.
- **Also:** the seed planner (`scripts/seed/plan.ts`) now takes the opening entry, starting Stage, and accent from `newJobFacts`, where it had copied them by hand.

**Tests:** `tests/lib/jobs-rules.test.ts`, RULE-1 to RULE-8.
- a new Job's defaults, and its accent round-robin
- that the facts the data layer writes are the ones the whole Job is built from
- re-selecting a Stage returns the same Job
- the backfill, and never backfilling on a move to `interested`
- an existing applied date left untouched
- the prepended entry, with the rest of the Job unchanged

The seed plan tests and every board, job page, and integration test pass unchanged.

**Verified:** typecheck, lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
