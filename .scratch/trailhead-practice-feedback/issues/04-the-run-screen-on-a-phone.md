# 04: The run screen on a phone

**What to build:** On narrow screens, pin the clock and question count to the top and Submit to the
bottom, so nothing important scrolls away. Show the transcript by default.

See `spec.md` → 4. The run screen on a phone.

**Blocked by:** 02 (the controls it lays out are the speaking-only ones)

**Status:** ready-for-agent

- [ ] Below `sm`, a bar sticks under the sticky app header (offset by the header's height), showing the
      clock (with its low-time amber) and "Question N of M". The large corner clock shows at `sm` and up
      only. Exactly one element has `role="timer"` at any width.
- [ ] Below `sm`, Submit and its hint ("The next question starts as soon as you submit." / "This is the
      last question.") stick to the bottom of the viewport with a card background. The page content gets
      bottom padding so the transcript is never hidden behind it. Respect
      `env(safe-area-inset-bottom)`.
- [ ] At `sm` and up, the layout is unchanged.
- [ ] The transcript is shown by default in both `InterviewPanel` and `PracticePanel`. "Hide transcript"
      still works.
- [ ] Checked at 375 × 667 and 390 × 844: the clock, count, and Submit are visible without scrolling
      while a long transcript grows.
- [ ] e2e at a phone viewport: the timer and Submit are in the viewport after the transcript has
      several lines.
