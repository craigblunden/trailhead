# 02: Answer questions with a running clock, pause between them, and submit

**What to build:** Once an Attempt exists (ticket 01), a Tenant can move through each question,
type an Answer, submit it, and reach completion after the last one. One total countdown runs for
the whole Attempt — never a per-question timer — and an untimed pause sits between questions.
Speaking (ticket 06) and length choice (ticket 05) arrive later; this ticket is typed input only,
at whatever length ticket 01 hardcodes.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] A single countdown for the whole Attempt runs only while a question is actively being
      answered.
- [ ] Between questions, the countdown is stopped until the Tenant chooses to continue — the pause
      itself is untimed.
- [ ] Typing and submitting an Answer records its transcript against the correct question.
- [ ] The Attempt reaches a completed state once every question has a recorded Answer.
- [ ] The countdown reaching zero mid-question ends the Attempt at that point: whatever was typed
      so far is not recorded, and any remaining questions are simply left unanswered — no question
      is force-submitted or retried.
- [ ] The record-Answer Route Handler is tested with the orchestration layer mocked, covering each
      outcome.
- [ ] The UI is tested with `fetch` mocked, covering the countdown running and pausing, submitting
      an Answer, and reaching completion.
