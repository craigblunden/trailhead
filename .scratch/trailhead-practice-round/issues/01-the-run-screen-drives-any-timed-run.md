# 01: The run screen drives any timed run, not only an Attempt

**What to build:** A prefactor with no visible change. The countdown and progress rules (time left,
the next unanswered question, whether every question has an Answer) and the run screen work over what
an Attempt and a Practice round will both have — ordered questions that may carry an Answer, a
countdown in seconds, and the seconds already answered for — rather than over the Attempt type itself.
Makes ticket 03 a matter of supplying a Practice round, per **ADR-0006**.

See `spec.md` → A Practice round ("Answering is identical to an Attempt").

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The shared timing and progress functions take a minimal run shape; an Attempt satisfies it
      unchanged, and nothing in that shape names a Job, a length, a score, or a Category mix.
- [ ] The run screen takes that shape plus a caption for what is being rehearsed ("Rehearsing for
      <role> at <company>" for an Attempt), and callbacks to record an Answer and to end on time-up —
      no Attempt-only fields.
- [ ] Every existing unit and end-to-end test for the Interview Simulator passes unchanged; new unit
      tests exercise the functions with a run that is not an Attempt.
- [ ] Code comments citing interview simulator and second pass tickets stay accurate.
