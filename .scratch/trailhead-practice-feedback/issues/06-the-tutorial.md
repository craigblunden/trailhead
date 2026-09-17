# 06: The Tutorial

**What to build:** A one-question guided run at `/interview/tutorial` that shows the question count,
the clock, turning on the microphone, and Submit, step by step. Offer it before a Tenant's first run,
and link to it from the Simulator page on every Plan.

See `spec.md` → 6. The Tutorial. Glossary: **Tutorial** (`CONTEXT.md`).

**Blocked by:** 03, 04 (it relies on the primed voice, "Your turn", and the phone layout; 05's failure
message is reused if it has landed, otherwise the plain error)

**Status:** ready-for-agent

- [ ] `/interview/tutorial`: a static segment (like `practice`), open to every Plan, behind
      `requirePageSession`. Nothing is fetched or stored: the run is an in-memory `TimedRun` with one
      personal-style question, "Tell me about a job you'd love to land next.", and 60 seconds. Its
      `onAnswer`/`onTimeUp` resolve locally.
- [ ] Before the clock runs, three callouts in order, each with Next: the question count ("Question 1
      of 1": one question at a time); the clock (one countdown, only running while you answer); "Turn
      on your microphone", a button that primes speech synthesis and starts recognition, so the
      browser's permission prompt appears here, explained just before. Callouts are accessible (focus
      moves to each; Escape or a Skip tutorial link leaves).
- [ ] Then the question is read aloud, "Your turn" appears and the clock starts. When the transcript
      first has words, a callout points at Submit: "Press Submit when you've finished answering."
- [ ] The end (on submit or time up): the transcript read back, "That's how every question works.", a
      primary button **Start a practice round** (free/basic → `/interview/practice`) or **Choose a job**
      (Pro → `/interview`), and a **Go through it again** link.
- [ ] Finishing or skipping writes a flag to localStorage (every read/write in try/catch).
- [ ] **The offer:** shown on the Simulator page and above Go on the Practice round and Attempt
      set-ups, when the Tenant has no finished Practice round and no finished Attempt (from data the
      pages already load, or a cheap count) and the flag is absent. Take the tutorial / Skip. Skip sets
      the flag.
- [ ] **Take the tutorial** link on the Simulator page for every Plan, always.
- [ ] Where speech recognition is unsupported, neither the offer nor the page's run is available; the
      page shows ticket 02's note.
- [ ] Code comments cite "practice feedback ticket 06"; the page and components say Tutorial, never
      "test" or "demo".
- [ ] Tests: component tests for the step order, the Submit callout appearing only once there are
      words, and the end's button per Plan. An e2e for the offer appearing for a new Tenant, skipping
      hiding it, and the tutorial running to its end with the fake recogniser. Manual check on an iPhone
      that the permission prompt appears at the microphone step and the question is heard.
