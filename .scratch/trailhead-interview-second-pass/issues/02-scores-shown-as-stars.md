# 02: Scores shown as stars

**What to build:** Everywhere the Scorecard shows a score today — overall, per Category, per Answer — it
shows five stars in half-steps beside a band word instead of a number out of 100. Scores are still
stored and returned as 0–100; only how they read changes.

See `spec.md` → The Scorecard.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] A pure mapping from a 0–100 score to stars: score ÷ 20, to the nearest half (70 → 3½, 0 → 0,
      100 → 5), unit-tested at the edges and at each band boundary.
- [ ] Bands are Strong (80+), Solid (60+), Developing (40+), and **Not there yet** (below 40); the
      "weak" band is renamed wherever it appears, including its colour mapping.
- [ ] One reusable star display: filled, half, and empty stars, the band word beside them, coloured by
      band as scores are today.
- [ ] No score number is visible; the accessible name reads like "3½ of 5 stars, solid", and the stars
      themselves are hidden from assistive technology.
- [ ] Overall, Category, and Answer scores on the Scorecard all use it; a Category with no score still
      reads "Not scored".
- [ ] Legible in light and dark themes and at phone width.
- [ ] The Scorecard component test is updated to assert stars and band words, not numbers.
