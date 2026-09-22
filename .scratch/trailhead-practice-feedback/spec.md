# Interview Simulator: fixes from the first phone test of a Practice round

**Status:** implemented

Settled in a grilling session on 2026-09-17, after the owner watched a first-time user take a free
Practice round on an iPhone. The glossary gained **Tutorial**, and **Answer** now says every Answer is
spoken (`CONTEXT.md`). No ADR: every decision here is cheap to reverse.

## Problem Statement

On a phone, a first-time user:

- could not tell how to get from the board to anything else, because the only navigation is behind
  the avatar;
- heard nothing when the question should have been read aloud, and so could not tell when the clock
  and microphone would start (the page waits up to 20 s for a voice that never came);
- had to scroll to find the clock, and was confused by switching between typing and speaking;
- had nothing explaining the question count, the clock, the microphone permission prompt, or pressing
  Submit when finished.

## Solution

1. On mobile, a hamburger menu replaces the avatar and holds everything.
2. Answers are spoken only. Typing is removed from Attempts and Practice rounds alike, and browsers
   that cannot transcribe cannot start a run.
3. Reading aloud is made reliable on iPhone. If the voice doesn't start within about 1.5 s, it is
   dropped. An unmistakable "Your turn" marks the moment the clock and microphone start.
4. On a phone, the clock and question count stay pinned at the top and Submit stays pinned at the
   bottom. The transcript shows by default.
5. A microphone that fails mid-run stops the clock and offers Try again, or leaving to resume later.
6. A **Tutorial**: one guided question, offered before a Tenant's first run of any kind.

## Decisions

### 1. Mobile navigation

- Below `md`, the avatar button is replaced by a hamburger button. It opens a thumb-sized side sheet,
  not the small dropdown, containing: the Tenant's name, email and Plan mark; Board ("Your trail"),
  Contacts, Documents, Interview Simulator (with the Pro mark where `canStartAttempt` is false);
  Account; Sign out.
- The Feedback button stays in the header at every width.
- At `md` and up, nothing changes except the avatar menu: it no longer repeats the four page links,
  because the primary nav is always visible there. It keeps name/email/Plan, Account, and Sign out.

### 2. Speaking only

- Typing an Answer is removed from the run screen, the Attempt set-up, and the Practice round set-up:
  no "How will you answer?" choice, no "Type instead" / "Speak instead", no typed notepad. The
  `speak`/`type` input mode goes with it.
- The set-ups say, in place of the choice, that answers are spoken, transcribed in the browser, and no
  audio is kept (the privacy line `SPEAK_RECOMMENDED` carried).
- A browser without speech recognition cannot start an Attempt, a Practice round, or Resume one. Go
  and Resume are replaced by a note: this needs a browser that can hear you, such as Chrome, Edge or
  Safari. A Tutorial is also not offered there.
- Answers saved as typed text read back exactly as before. Nothing about stored data changes.
- The server's answer and time-up routes are unchanged. They take text, whatever produced it.
- Known consequence: a Tenant who cannot or would rather not speak cannot use the Simulator for now.
  This is accepted by the owner ("for now") and worth revisiting.

### 3. Reading aloud, and the handover

- **The first utterance is started inside the Tenant's tap.** Go, Resume, Submit, and the Tutorial's
  microphone step prime speech synthesis synchronously in their click handlers (for example, an empty
  or silent utterance) before any `await`. iPhone Safari only allows speech that begins inside a
  user gesture. The Go handler currently awaits the server before the question is spoken, so the tap
  no longer counts.
- **A voice that doesn't begin is a failure.** If the utterance's `start` event hasn't fired within
  about 1.5 s, the question counts as asked: the voice is cancelled and the clock and microphone start.
  Once the voice has begun, the existing guard (length × 80 ms + 2 s, at most 20 s) still applies.
- The microphone stays **off** while the question is read, as now. Otherwise the recogniser
  transcribes the voice, especially from a phone speaker.
- **"Your turn."** The moment the question counts as asked, the screen says so plainly ("Your turn —
  start speaking") alongside the soundwave, and the clock visibly begins. Screen readers hear it once.
  While reading, the existing "Reading the question aloud…" line and Skip stay.

### 4. The run screen on a phone

- Below `sm` (the narrow layout), a bar sticks to the top under the app header, showing the clock and
  "Question N of M". The large corner clock is for wider screens only. Submit and its hint stick to
  the bottom of the viewport. The question, the "aim for" line, the soundwave and the transcript
  scroll between them.
- Wider screens keep the current layout.
- The transcript is **shown by default** and can still be hidden. It holds only this question's words.

### 5. The microphone failing mid-run

- When the recogniser gives up (permission refused, no microphone, the network, or repeated quick
  stops), the clock stops. The time is only banked when an Answer lands, so stopping loses nothing.
- The message says why, without mentioning typing, and offers:
  - **Try again**: restarts the microphone and the clock.
  - **Leave and resume later**: back to the Simulator page (or the Practice round page), where Resume
    already offers the next unanswered question with the time that was left.
- What was already heard on that question stays on screen, and Submit still works if there is
  anything to send.
- This also covers an iPhone with dictation turned off, which reports the API present and then
  refuses at start.

### 6. The Tutorial

- **What:** one fixed question, "Tell me about a job you'd love to land next.", on a **1:00** clock,
  run on the real run screen. It is saved nowhere: no route, no table, no request. It is counted by
  no Limit, never scored, and calls no model.
- **Steps, in order, before the clock ever runs.** Each is a callout with Next, pointing at the thing
  it describes:
  1. "Question 1 of 1": how many questions a run has, and that each comes one at a time.
  2. The clock: one countdown for the whole run, which only runs while you're answering.
  3. "Turn on your microphone": a button. Tapping it primes speech synthesis (see 3) and asks for the
     microphone (the browser's permission prompt appears here, explained beforehand). If refused, the
     failure message from 5 is shown with Try again.
  Then the question is read aloud, "Your turn" appears and the clock starts. Once the transcript
  has words, a final callout points at Submit: "Press Submit when you've finished answering."
- **The end:** what they said (the transcript), then "That's how every question works." One primary
  button: **Start a practice round** on free/basic (to `/interview/practice`) or **Choose a job** on Pro
  (to `/interview`). A quiet **Go through it again** link restarts it. If the clock runs out, the same
  end is shown.
- **Who is offered it:** a Tenant with no finished Practice round and no finished Attempt, and on
  this device no record of having finished or skipped the Tutorial (localStorage, read defensively).
  The offer appears before Go on the Practice round set-up and the Attempt set-up, and on the
  Simulator page. It takes the Tutorial or skips it. Skipping, like finishing, is remembered on the
  device.
- **Always reachable:** a "Take the tutorial" link on the Simulator page, on every Plan, regardless of
  history.
- **Where:** a page of its own (`/interview/tutorial`, a static segment matched before
  `/interview/<job>`, like `practice`).
- Not offered, and the link says why, in a browser that cannot transcribe (see 2).

## Out of Scope

- Bringing typing back, or any other non-spoken way to answer.
- Keeping the microphone on while a question is read.
- A bottom tab bar, or any change to desktop navigation beyond trimming the avatar menu.
- Storing Tutorial completion on the server.
- Tutorial callouts inside a real Practice round or Attempt.
- Choosing a voice, speech rate, or replaying a question (still out, as in the Practice round spec).

## Further Notes

- Tickets live in `issues/`. Code comments should cite "practice feedback ticket NN".
- Nothing here has been checked on a real iPhone yet. The iPhone Safari explanation in 3 is the likely
  cause, not a confirmed one. Tickets 03 and 06 each end with a manual check on an iPhone.
- The e2e suite answers every question by switching to typing (`e2e/interview.spec.ts`, `answerOne`).
  With typing gone, it needs a fake `webkitSpeechRecognition` installed with `addInitScript`, the way
  `speechSynthesis` is already faked there, so tests can "say" an answer.
- No migration and no new table in any ticket.
