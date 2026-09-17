# 05: When the microphone fails mid-run

**What to build:** When speech recognition gives up during a question, stop the clock, say why, and
offer Try again or leaving to resume later. Keep whatever was already heard.

See `spec.md` → 5. The microphone failing mid-run.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] When `useSpeech` reports an error (permission refused, no microphone, network, or repeated quick
      stops), the run screen's clock stops, the same way it stands still while submitting. The question's
      elapsed seconds so far are kept for its eventual Answer, as a failed submission's are
      (`spentOnFailedTries`).
- [ ] The error message (no mention of typing) is shown with **Try again**, which clears the error and
      restarts the microphone and clock, and **Leave and resume later**, a link to the page the run came
      from (`/interview/<job>` for an Attempt, `/interview/practice` for a Practice round). `RunScreen`
      takes that href as a prop, so it still can't tell which run it drives.
- [ ] The transcript heard before the failure stays visible, and Submit stays enabled when it isn't
      empty.
- [ ] `service-not-allowed` (e.g. an iPhone with dictation off) gets its own message that suggests
      turning on dictation, or trying another browser.
- [ ] Time-up cannot fire while the clock is stopped.
- [ ] Component tests with a fake recogniser that errors: the clock stops, Try again restarts it, and
      the transcript is kept. e2e: the fake recogniser emits `not-allowed`, and Leave and resume later
      lands on Resume with the time that was left.

## Comments

- 2026-09-17 (implementation): "Leave and resume later" is a button that returns the page to its Resume step, not a link: the run already sits at the URL a link would go to, and a same-URL navigation keeps the running state.
