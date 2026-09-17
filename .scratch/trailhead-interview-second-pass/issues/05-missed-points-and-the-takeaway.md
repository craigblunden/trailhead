# 05: Missed points and the Takeaway

**What to build:** The Scorecard tells the Tenant what to do differently, and says it first. Each Answer
shows what landed and one to three Missed points — specific things it could have said, drawn from the
posting or the resume. The whole Attempt gets a Takeaway: the two or three things most worth changing,
shown as "For next time" directly under the overall stars, before any per-Answer detail.

See `spec.md` → The Scorecard, and **Missed point**, **Takeaway**, **Scorecard** in `CONTEXT.md`.

**Blocked by:** 02 (the star display), 03 (Not reached rows, and which Answers reach the scorer)

**Status:** ready-for-agent

- [ ] The scoring call's structured output carries, per Answer, a score, `whatLanded` (one sentence) and
      one to three Missed points; and for the Attempt, a Takeaway of two or three points. The schema
      respects what the live API accepts (it refuses integer min/max — bound in the prompt and validate
      after, as the score already does).
- [ ] The scoring prompt defines a Missed point as something specific from the posting or resume the
      Answer could have used — never generic advice — and each Takeaway point as naming what across
      the Answers it is drawn from. Material-not-instructions and honesty rules are unchanged.
- [ ] What landed, Missed points, and the Takeaway are stored with the Attempt and its Answers, bounded
      in length like every other stored free text, and read back identically after a reload.
- [ ] Scorecard order: overall stars and band word → "For next time" callout in the brand colour →
      Category rows → a card per Answer with question, stars, What landed, and Missed points as a
      highlighted list with a marker icon. Unreached questions keep their "Not reached" card.
- [ ] An Attempt scored before this ticket shows its single rationale in place of What landed and
      Missed points, and no "For next time" callout.
- [ ] A response missing a required part, or with too many Missed points, is treated as a malformed
      response (retryable, spends nothing) — tested against the fake Claude server.
- [ ] Component tests cover a new-shape and an old-shape Scorecard; the end-to-end scoring run asserts
      "For next time" and Missed points appear.
- [ ] Light and dark themes, phone width.
