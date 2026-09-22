# Interview Simulator: a Practice round for free and basic, and questions asked aloud

**Status:** implemented

The owner approved the fixed question set below on 2026-09-17.

Settled in a grilling session on 2026-09-17. The glossary gained **Practice round** (`CONTEXT.md`).
**ADR-0006** records why a Practice round is stored in tables of its own rather than as an Attempt
without a Job. ADR-0005 is unchanged: only `pro` starts Attempts.

## Problem Statement

A Tenant on `free` or `basic` can open the Interview Simulator but only see its set-up locked: there is
no way to feel what answering against the clock is like before deciding it is worth Pro. And a Tenant
answering out loud reads the question off the screen in silence while the clock is already running,
which is neither how an interview sounds nor fair on the first seconds of every answer.

## Solution

A **Practice round**: four general personal and behavioural questions, from a fixed set written for
any role, answered against an eight-minute clock exactly as an Attempt is — spoken or typed, resumable,
kept — but never scored. Free and basic can take as many as they like; the end screen reads their
answers back and shows scoring as the Pro feature it is. Separately, for every run of the Simulator
answered by speaking, the browser reads each question aloud and the clock starts when it has been
asked.

## Decisions

### Who gets what

- `free` and `basic`: the locked Attempt set-up stays as a preview, and a Practice round can be started.
- `pro`: the full Simulator as now. A Practice round cannot be started (refused server-side); any taken
  before upgrading are still listed and readable.
- A Practice round is counted by no Limit. Starting one costs nothing and calls no model.

### A Practice round

- **Four questions: two personal, then two behavioural.** Countdown **8:00** — the Categories' answer
  times added up (2 × 1½ + 2 × 2½). No length to choose. Each question still shows "aim for about
  1½ / 2½ min".
- Questions are drawn at random from the **fixed question set** below, preferring ones not asked in the
  Tenant's previous Practice round. Each round stores the question text it asked.
- Answering is identical to an Attempt: one countdown, active-time accounted, spoken or typed with the
  same switching, time-up keeps the half-finished answer, questions after it are **unreached**.
- One unfinished Practice round at a time. Returning to it offers **Resume** (same questions, the time
  that was left) or **Start over**, which discards it — no warning, it cost nothing.
- **After it ends** (every question answered, or time up): "That's the practice round" / "Time's up",
  then each question with the Tenant's own answer read back (an unreached one says "Not reached"). In
  place of the Scorecard, a panel says scoring — stars, what landed, what was missed, and what to
  change next time — comes with Pro, linking to the Plan comparison on the Account page. No fake or
  blurred scores. Buttons: **Practise again**; and a line pointing to the full Simulator on Pro.
- A saved Practice round is **never scored**, including after upgrading.
- **Saved rounds** are listed on the Simulator hub under "Practice rounds", newest first: "Practice
  round", the date, "Not scored". Each opens its read-back at a link of its own. Only finished rounds
  are listed; the unfinished one is offered as Resume instead. Kept until Account deletion.

### Questions asked aloud

- Applies to Attempts and Practice rounds alike, and only when answering by speaking in a browser with
  speech synthesis.
- When a question comes up, the browser's default voice for the page language reads the question text
  (`SpeechSynthesisUtterance`). The question is on screen throughout; the clock shows its time,
  standing still; the microphone is **off** — otherwise the recogniser transcribes the voice.
- **The clock starts when the question has been asked**: when the voice finishes, the moment the
  microphone turns on. This replaces "the clock runs from the moment a question is visible" wherever
  the code or copy says it.
- **Skip** stops the voice and starts the clock at once.
- Switching to typing while it is read stops the voice and starts the clock. Switching to speaking
  partway through a question does not read it — its clock is already running.
- Resuming onto a question reads it again. No "hear it again" once answering has begun.
- No speech synthesis, an error from it, or a voice that never finishes: the clock starts straight away
  with no message. A guard of roughly the question's length × 80 ms plus 2 s (at most 20 s) cancels the
  voice and starts the clock, so a stuck voice can never freeze the Attempt.
- The voice is cancelled whenever the question unmounts (submitted, time up, navigated away).
- Typing: nothing is read, and nothing changes.

### The fixed question set (approved by the owner, 2026-09-17)

Personal (answer time 1½ min):

1. Walk me through your background and what has led you to where you are now.
2. What are you looking for in your next role that you don't have in your current or most recent one?
3. What kind of work gives you the most energy, and what kind drains it?
4. How would the people you've worked most closely with describe you?
5. What's something you've taught yourself recently, and how did you go about it?
6. Where do you want your career to be in a few years, and how does your next role fit into that?

Behavioural (answer time 2½ min):

1. Tell me about a time a plan you were responsible for fell apart. What did you do?
2. Describe a time you disagreed with someone you worked with about how to do something. How was it
   resolved?
3. Tell me about a mistake you made at work — how you found out, and what you changed afterwards.
4. Give me an example of a time you had more to do than you could get done. How did you decide what
   came first?
5. Tell me about a time you had to learn something unfamiliar quickly to deliver on a commitment.
6. Describe a piece of work you're proud of, and the part you personally played in it.

## Out of Scope

- Scoring a Practice round in any form, now or after upgrading.
- A weekly Limit on Practice rounds, or a cap on how many are kept.
- Real Attempt entitlements for `free` and `basic` (ADR-0005). When they land, whether Practice rounds
  stay alongside them is a new decision.
- What a Tenant who moves down from `pro` sees of their scored Attempts (unchanged).
- Choosing a voice, speech rate, or replaying a question.
- Reading anything aloud other than the question text.

## Further Notes

- Tickets live in `issues/`. Code comments should cite "practice round ticket NN", so they never
  collide with "interview simulator ticket NN" or "interview second pass ticket NN".
- Chrome refuses speech synthesis without a user activation; Go, Resume, and Submit all provide one,
  and a refusal is just the no-synthesis fallback above.
- Starting a Practice round is free but writes rows; there is no rate limit on it, as there is none on
  creating Jobs. Worth revisiting if it is ever abused.
