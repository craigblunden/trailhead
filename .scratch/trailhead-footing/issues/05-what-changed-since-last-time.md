# 05: What changed since last time

**What to build:** The earlier Footings, and the one sentence that is the whole reason they are kept.

See `spec.md` → How it is shown. **ADR-0007** → "History, not replacement".

**Blocked by:** 04

**Status:** ready-for-review

- [ ] When a Job has more than one Footing, the newest carries a line comparing its overall band to the
      previous one — *"Stronger than your last resume on this one"*, or steadier wording when the band
      is unchanged, or the honest thing when it fell.
- [ ] Compare **bands**, not numbers. A 3-point move inside one band is not a change worth a sentence,
      and saying so in numbers would break the never-a-number rule anyway.
- [ ] Earlier Footings are reachable from the job page, newest first, each with its date and the bands
      it recorded. Not a chart, not a trend line — a short list.
- [ ] The comparison reads the stored dimension rows through the current weights, so the history stays
      correct if the weights are ever tuned.
- [ ] Tests: two Footings whose bands differ produce the sentence; two in the same band do not produce
      a false improvement; a single Footing produces no sentence at all.
