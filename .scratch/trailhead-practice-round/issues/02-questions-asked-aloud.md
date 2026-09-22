# 02: Questions asked aloud before the clock starts

**What to build:** When a Tenant answers by speaking, the browser reads each question aloud as it comes
up, and the countdown and microphone start only once it has been asked — or when the Tenant skips.

See `spec.md` → Questions asked aloud.

**Blocked by:** None (can start immediately; touches the run screen alongside 01, so whichever lands
second rebases)

**Status:** ready-for-review

- [ ] A client hook reads a question's text with `SpeechSynthesisUtterance` in the page language and
      reports when it has been asked: on the utterance's end, on an error, on skip, on cancel, or on a
      guard timeout (text length × 80 ms + 2 s, at most 20 s) that also cancels the voice. Without
      speech synthesis it reports asked immediately. It cancels the voice on unmount.
- [ ] Support for synthesis is detected the way support for recognition already is, with no hydration
      mismatch.
- [ ] The run screen gains an "asking" state before "answering", only while speaking with synthesis
      available: the question is visible, the clock shows its time standing still, the microphone is
      off, and a **Skip** control starts answering at once. Screen readers are told the question is
      being read and how to skip.
- [ ] Time spent being asked is never added to the Answer's elapsed seconds.
- [ ] Switching to typing while asking stops the voice and starts the clock; switching to speaking mid
      question does not read it. Resuming onto a question reads it again.
- [ ] Typing: behaviour unchanged.
- [ ] Code comments and copy that say the clock starts when a question is visible — including the hub's
      "The clock starts with your first question" — say it starts when the question has been asked.
- [ ] Unit tests for the hook's end, error, skip, timeout, and unsupported paths with a fake speech
      synthesis; an end-to-end test that stubs it and checks the clock stands still until the utterance
      ends or Skip is pressed.
