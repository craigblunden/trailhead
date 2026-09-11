# 02: Job rules return the whole new Job and the whole moved Job

**Status:** ready-for-agent

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

- [ ] New-Job defaults are written in one place. The data layer, the optimistic update, and the fixture client all take them from there.
- [ ] A Stage move is decided in one place and used by all three: the new Stage, the applied-date backfill, and the prepended Activity entry.
- [ ] The rules have direct unit tests:
  - re-selecting the current Stage changes nothing
  - leaving `interested` with no applied date backfills one
  - moving to `interested` never sets one
  - an existing applied date is never touched
- [ ] Every existing board, job page, and integration test passes, and none changes what it asserts.
