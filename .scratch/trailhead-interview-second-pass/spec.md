# Interview Simulator, second pass: fairer scoring, clearer feedback, and a history of Attempts

**Status:** implemented

Settled in a grilling session on 2026-09-17, after the owner used the shipped Interview Simulator
(`.scratch/trailhead-interview-simulator/`). The glossary gained **Missed point**, **Unreached
question**, and **Takeaway**, the **Scorecard** entry was rewritten, and **Category** now carries an
**answer time** (`CONTEXT.md`). No ADR: every decision here is cheap to reverse.

## Problem Statement

The Scorecard feels harsh for the time given. A question the countdown never reached is sent to the
scorer as silence and marked at the bottom of the scale at full weight, so running short halves the
overall score; whatever was half-said when the clock ran out is thrown away; and every question is
budgeted about a minute, which is unrealistic for a behavioural story and far too little for a design
question. The score reads as a bare number out of 100, and each Answer gets one rationale that mixes
what was good with what was missing, so it is hard to see what to do differently. Earlier Attempts
cannot be seen at all, a second Attempt on the same Job tends to ask the same things, and clicking a
Job in the picker shows nothing until the next page arrives.

## Solution

Running out of time costs less: an **Unreached question** counts as nothing at half weight, and the
half-finished answer is kept. Each Category has its own **answer time**, the lengths grow to fit, and
Basic and Pro ask fewer technical and design questions. Scores are shown as stars with a band word.
Every Answer gets **What landed** and its **Missed points**, and the whole Attempt a **Takeaway**
shown first. The hub lists past Attempts, each opening its own Scorecard. A repeat Attempt on a Job
is told what was asked before. Picking a Job shows the wait at once. After a Tenant's second scored
Attempt, the Scorecard asks once how the Simulator is going.

## Decisions

### Scoring and time

- An **Unreached question** is one the countdown ran out before the Tenant got to — no Answer was
  recorded. It is **not sent to the scorer**: the app gives it 0 with no rationale, and it counts at
  **half weight** in the Category and overall rollups. Worked example, five questions, three answered
  at 80, two unreached: overall 60 (full weight would be 48).
- A question the Tenant reached and submitted empty while time remained is an Answer: scored by
  Claude, full weight.
- When the countdown reaches zero mid-question, whatever was typed or transcribed so far is recorded
  as that question's Answer and scored. If nothing had been said yet, nothing is recorded and the
  question on screen is unreached — a question put up in the last seconds is not a zero at full weight.
- Each Category's **answer time**, in minutes: personal 1½, behavioural 2½, stakeholder 2, technical
  3, design 4. It is a guide shown under each question ("aim for about 3 min"), never a cut-off: the
  Attempt keeps one countdown.
- Lengths and mixes (personal / behavioural / stakeholder / technical / design):

  | Plan    | Countdown | Mix       | Questions |
  | ------- | --------- | --------- | --------- |
  | `free`  | 15 min    | 1/1/1/1/1 | 5         |
  | `basic` | 20 min    | 2/2/2/1/1 | 8         |
  | `pro`   | 30 min    | 2/3/3/2/2 | 12        |

  Every Attempt still spans all five Categories. ADR-0005's Plan gate is unchanged: only `pro` starts
  Attempts this phase, so `pro` may choose any of the three lengths.
- The question writer is told each question's answer time instead of "about a minute"; the scorer is
  told each Answer's answer time and judges depth against it.

### The Scorecard

- Scores stay 0–100 in storage. On screen: five stars in half-steps (score ÷ 20, to the nearest half),
  always beside a band word — Strong (80+), Solid (60+), Developing (40+), **Not there yet** (below
  40; renamed from "weak", and not "Needs work", which App feedback's rating already uses). No number
  is shown; assistive technology hears "3½ of 5 stars, solid". Used overall, per Category, and per
  Answer.
- Scoring returns, per Answer, a score, **What landed** (one sentence), and one to three **Missed
  points** — specific things the Answer could have said, drawn from the posting or the resume; and
  for the Attempt, a **Takeaway** of two or three points, each saying what across the Answers it is
  drawn from.
- Order, top to bottom: overall stars and band word; **"For next time"** (the Takeaway) as a callout in
  the brand colour; Category rows; a card per Answer — question, stars, What landed, then Missed points
  as a highlighted list. An Unreached question's card says "Not reached", with no stars and no Missed
  points; a Category whose questions were all unreached says the same.
- Attempts scored before this effort keep their single rationale and their original length; their
  overall is recomputed from their Answers under the new weighting (a question with no Answer recorded
  is unreached). No re-scoring call.

### History and variety

- `/interview` lists, below the picker, every scored Attempt across all Jobs plus the in-progress
  one(s), newest first: Job, date, length, overall stars; an in-progress row offers Resume. Reset and
  never-scored Attempts are left out.
- A scored row opens a view-only Scorecard at `/interview/<job>/<attempt>`. `/interview/<job>` still
  opens that Job's latest Attempt for Resume or Go.
- Generating questions for a Job passes the questions of up to its three most recent earlier Attempts,
  reset ones included. The writer is told to cover new ground; where the posting and resume have no
  new ground left, to return to a topic from a clearly different angle rather than invent anything.
  The earlier questions are fenced as material like every other input.

### Waits and asking

- Choosing a Job in the picker shows the existing Interview Simulator loading state at once, in the
  shared vocabulary: the page in outline and the hiker in the header.
- Once, on the Scorecard shown the moment a Tenant's **second** scored Attempt (across all Jobs) is
  scored, a small card below the whole Scorecard asks how the Simulator is going. Its button opens the
  existing App feedback form, marked as about the Interview Simulator so the email says so. Not shown
  when that Scorecard is reopened later, and nothing is stored to remember it.

## Out of Scope

- Re-asking a weak question, or deliberately returning to a previous Missed point.
- The Tenant's own assessment of how they are doing, stored or fed to the question writer (distinct
  from App feedback).
- Per-question clocks that cut the Tenant off.
- Real entitlements for `free` and `basic` (ADR-0005 still stands).
- Provisioning App feedback's mail — until it is, the ask in the last ticket reaches no inbox.

## Further Notes

- Tickets live in `issues/`. Code comments on the first effort cite "interview simulator ticket NN";
  comments for this effort should cite "interview second pass ticket NN" so the two never collide.
