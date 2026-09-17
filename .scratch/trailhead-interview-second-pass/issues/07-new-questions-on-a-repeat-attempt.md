# 07: New questions on a repeat Attempt

**What to build:** Rehearsing the same Job again asks about different things. When questions are
written for a Job that already has Attempts, the writer is shown what was asked before and told to cover
new ground — and, once the posting and resume run out of new ground, to come back to a topic from a
clearly different angle rather than invent anything.

See `spec.md` → History and variety.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Starting an Attempt reads the questions of this Job's three most recent earlier Attempts,
      including reset and unscored ones, from the Tenant's own data only.
- [ ] The question-writing prompt includes them, fenced as material like every other input, with
      instructions to avoid repeating their substance, to prefer topics not yet covered, and — only when
      nothing new is left — to revisit a topic from a clearly different angle. The existing rule against
      inventing projects, employers, or figures is unchanged.
- [ ] A first Attempt on a Job produces the same prompt as before (no empty "earlier questions" block).
- [ ] Earlier questions are stripped of invisible characters and bounded, so a long history cannot
      crowd out the posting and resume.
- [ ] Prompt tests cover none, one, and three earlier Attempts, and that a fourth-oldest is left out; the
      start orchestration test asserts the earlier questions reach the call.
