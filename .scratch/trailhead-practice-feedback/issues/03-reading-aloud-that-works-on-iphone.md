# 03: Reading aloud that works on iPhone, and "Your turn"

**What to build:** Start the voice inside the Tenant's tap so iPhone Safari lets it speak. Give up on
a voice that never begins after about 1.5 s. Mark the moment the clock and microphone start with a
plain "Your turn".

See `spec.md` → 3. Reading aloud, and the handover.

**Blocked by:** None (touches the run screen alongside 02; whichever lands second rebases)

**Status:** ready-for-agent

- [ ] A small helper primes speech synthesis synchronously (for example, speaking an empty or silent
      utterance) and is called at the top of the click handlers for Go (Attempt and Practice round),
      Resume, Start over, and Submit, before any `await`. It is a no-op where synthesis is unsupported.
- [ ] `useAskAloud` listens for the utterance's `start` event. If it hasn't fired within ~1.5 s, the
      voice is cancelled and the question counts as asked. After `start`, the existing `askGuardMs`
      guard applies as now. Exported constant, unit-tested with a fake synthesis that never starts, and
      one that starts late.
- [ ] The microphone stays off while asking (unchanged).
- [ ] When the question counts as asked, the run screen shows "Your turn — start speaking" beside the
      soundwave in a `role="status"` region, so it is announced once. It stays until the transcript
      has words (or for the rest of the question; implementer's call, but not a flash).
- [ ] The hub/set-up copy about when the clock starts still reads true.
- [ ] e2e: with a fake synthesis that never fires `start`, the clock begins within ~2 s, not the full
      guard.
- [ ] Manual check on an iPhone (Safari): the first question is heard after Go, and "Your turn"
      appears when it finishes. Note the result in a comment on this ticket.

## Comments

- 2026-09-17 (implementation): the manual iPhone check has not been done yet.
