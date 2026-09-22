# 01: The Footing module and the Jev client

**What to build:** `src/lib/footing.ts` — the pure module owning every number and every word — and
`src/server/footing/`, the TypeSafe call, shaped exactly like `src/server/interview/claude.ts`.

See `spec.md` → The five dimensions, The levels, The provider.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] `npm install @typesafe-ai/sdk`. It is server-side, Node 20+.
- [ ] `src/lib/footing.ts` exports the five `FOOTING_DIMENSIONS`, their labels and blurbs, the four
      overall `WEIGHTS` (commented as a starting guess to be tuned, not a measured result), the level
      count, `normalise(score, levels)` → 0–100, and `LOW_CONFIDENCE` (0.4). It imports `scoreBand`
      and `SCORE_BAND_LABEL` from `src/lib/interview.ts` and defines **no new band vocabulary**.
- [ ] The five `criteria` level sets are authored here, five levels each, low to high, as `{ what,
      examples? }` objects describing situations rather than degrees. Field names identical within a
      dimension. The Proof of work set in `spec.md` is the shape and the bar for the other four.
- [ ] `src/server/footing/typesafe.ts` reads `TYPESAFE_API_KEY` here and nowhere else, exports
      `footingAvailable()` and a `createFootingClient()` returning null with no key, sets a timeout
      bounded inside the route's `maxDuration`, and honours a base-URL override so tests can point it
      at a fake. `server-only` at the top.
- [ ] One request, five questions, one shared `state`. The state is built from the job description,
      the resume text and the cover-letter text, truncated to a documented budget inside Jev's 32k
      state limit, with `stripInvisible` applied on the way in.
- [ ] The response is validated before anything downstream sees it: five known dimension keys, each
      score within 0..levels-1, each confidence within 0..1. Anything else is a malformed answer and
      not a result.
- [ ] Unit tests: normalisation endpoints land on 0/25/50/75/100; each of those bands through
      `scoreBand()` is `not-there-yet`/`not-there-yet`/`developing`/`solid`/`strong` — pinning the
      arithmetic reason for five levels rather than four; weights sum to 1.0; Letter is absent from
      the weights.
- [ ] A fake TypeSafe server beside the existing fake Anthropic one, so the e2e suite never calls out.
