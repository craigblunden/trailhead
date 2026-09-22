# 04: The Footing on the job page

**What to build:** The Footing on the job detail page — the four dimensions, the overall band, the
Letter dimension beside the letter, the stale line, and the control that scores it.

See `spec.md` → How it is shown, Confidence.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Beside the Application kit: the overall band word, then the four dimensions each with their own
      band. The Letter dimension sits beside the letter instead, not with the four.
- [ ] **No number is ever rendered** — no percentage, no "64", no progress bar read as a percentage.
      Band words and the existing `SCORE_BAND_CLASS` colours only, per `CONTEXT.md`.
- [ ] Assistive technology hears the band word and the dimension, in the spirit of `starsLabel()`.
      Colour is never the only carrier of the band.
- [ ] A dimension below the confidence threshold is marked **not clear-cut** beside its band. When
      mean confidence across the four is low, one line above the breakdown says so; the dimensions
      themselves stay unmarked in that case rather than repeating it five times.
- [ ] One control to score. Before any Footing exists it invites the first one; when the newest is
      stale it offers to run it again. It is disabled with the existing not-ready copy when the Job
      has no description or no resume, and absent entirely when `footingAvailable()` is false.
- [ ] A stale Footing is **shown**, with a line saying what changed since it ran (the resume, the
      letter, or the description). It is never hidden and never silently replaced.
- [ ] Nothing is added to the board card, the board's list query, `jobs-provider.tsx` or `job-cache.ts`.
- [ ] An e2e spec against the fake provider: score a Job, see five bands; edit the description, see the
      stale line and the same bands; score again, see the new ones.
