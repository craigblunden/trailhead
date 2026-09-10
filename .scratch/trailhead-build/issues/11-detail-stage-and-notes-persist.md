# 11: The job detail page is real, and stage changes and note edits persist

**Status:** ready-for-agent

**Blocked by:** 10

## What to build

Opening a job shows its real record, moving it between stages writes history, and editing its
description or notes survives a reload. This completes the Phase-2 promise: the board does exactly
what it did before, it just remembers.

**Another user's job id and a nonexistent one are the same thing.** Both render Phase 1's "This job
isn't on your trail". Returning a distinguishable error for a foreign id confirms the row exists,
which is the whole IDOR surface reopened by a friendlier error message.

**Stage changes carry rules that already exist in the prototype and must survive the move to the
server:**

- Moving to the stage a job is already in is a no-op. No duplicate activity entry.
- A move prepends a "Moved to …" entry dated today.
- Moving *off* `interested` with no applied date on file backfills one. Moving *to* `interested`
  never sets one.
- The read, the write, and the activity insert happen in one transaction. A crash midway must not
  leave a stage change without its history.

**Editing is an allowlist, not a filter.** Only description and notes are writable this phase, and any
other field in the patch is *rejected* rather than silently dropped — so a field added later cannot
become writable by accident.

The optimistic path from ticket 09 now runs against a server that can genuinely say no. A rejected
mutation rolls back visibly and surfaces a non-blocking error. Silently reverting, and leaving the
user to notice their change vanished, is not acceptable.

## Acceptance criteria

- [ ] A job detail page renders the real record, with activity newest-first and contacts in a stable
      order
- [ ] An unknown id and another user's id are indistinguishable, and both render "This job isn't on
      your trail"
- [ ] A stage change writes exactly one activity entry, in the same transaction as the change
- [ ] Re-selecting the current stage writes nothing
- [ ] The applied-date backfill rules hold in both directions, tested against a frozen clock
- [ ] Editing description and notes persists across a reload
- [ ] A patch containing any other field is rejected, with a test naming a field that is not on the
      allowlist
- [ ] A cross-user integration test proves user B cannot read, edit, or restage user A's job through
      any action
- [ ] A rejected mutation rolls the board back visibly and shows a non-blocking error
