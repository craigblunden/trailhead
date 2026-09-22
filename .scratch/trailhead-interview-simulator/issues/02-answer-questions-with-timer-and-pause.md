# 02: Answer questions with a running clock, pause between them, and submit

**What to build:** Once an Attempt exists (ticket 01), a Tenant can move through each question,
type an Answer, submit it, and reach completion after the last one. One total countdown runs for
the whole Attempt — never a per-question timer — and an untimed pause sits between questions.
Speaking (ticket 06) and length choice (ticket 05) arrive later; this ticket is typed input only,
at whatever length ticket 01 hardcodes.

**Blocked by:** 01.

**Status:** ready-for-review

- [ ] A single countdown for the whole Attempt runs only while a question is actively being
      answered.
- [ ] Between questions, the countdown is stopped until the Tenant chooses to continue — the pause
      itself is untimed.
- [ ] Typing and submitting an Answer records its transcript against the correct question.
- [ ] The Attempt reaches a completed state once every question has a recorded Answer.
- [ ] The countdown reaching zero mid-question ends the Attempt at that point: whatever was said or
      typed so far is recorded as that question's Answer (changed 2026-09-17 — discarding it read as
      the app losing answers), and any remaining questions are simply left unanswered — no question
      is retried. Before scoring, an Attempt that ran out says how many questions were answered.
- [ ] The record-Answer Route Handler is tested with the orchestration layer mocked, covering each
      outcome.
- [ ] The UI is tested with `fetch` mocked, covering the countdown running and pausing, submitting
      an Answer, and reaching completion.

## Comments

**2026-09-16 — the untimed pause is removed, at the owner's direction.** After the first build, the
owner asked for the interview to run without a pause: "when the user is ready to start they select Go
and the timer starts with the question visible rather than the user choosing to start the timer
whenever they want, same with the next question when they click submit it should start the timer on
the next question."

This reverses two lines above — "an untimed pause sits between questions" and "Between questions, the
countdown is stopped until the Tenant chooses to continue" — and the spec's user story 9. What holds
now:

- Go puts the first question on screen with its clock already running; no second press.
- Submitting an Answer puts the next question up with its clock running at once.
- The clock stands still only while an Answer is on its way to the server — the network's time, not
  the Tenant's — and on a failed submission the seconds already spent are kept, so a retry can't hand
  time back.
- Active-time accounting is unchanged: leaving the page stops the clock, and Resume puts the next
  unanswered question up with exactly the time that was left.
- The briefing tells the Tenant before Go that the clock doesn't pause, so the second question
  arriving the moment they submit the first doesn't catch them out.

The last checkbox's "the countdown running and pausing" now reads as running continuously and standing
still during submission; `tests/components/interview.test.tsx` IV-U15–IV-U17 cover it.
