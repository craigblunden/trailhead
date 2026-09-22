# 04: Answer time per Category, and new lengths

**What to build:** Each Category has its own answer time, and an Attempt's length is built from them, so
a design question gets minutes rather than the same minute as "why this role". The lengths become 15,
20, and 30 minutes, with fewer technical and design questions on the longer two. While answering, the
Tenant sees how long to aim for on each question; the question writer and the scorer both know each
question's answer time.

See `spec.md` → Scoring and time, and **Category** in `CONTEXT.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] Answer times per Category: personal 1½, behavioural 2½, stakeholder 2, technical 3, design 4
      minutes.
- [ ] Lengths and mixes: 15 min 1/1/1/1/1; 20 min 2/2/2/1/1; 30 min 2/3/3/2/2 (personal / behavioural /
      stakeholder / technical / design). `free` is offered 15, `basic` 15 and 20, `pro` all three. A
      unit test pins that each mix spans all five Categories and that its answer times add up to within
      a couple of minutes of its countdown.
- [ ] The countdown stays one for the whole Attempt; under each question the Tenant sees "Aim for about
      N min" for its Category, with no cut-off.
- [ ] The question-writing prompt states each Category's answer time in place of "about a minute"; the
      scoring prompt gives each Answer's answer time and tells the scorer to judge depth against it.
- [ ] The start screen, the locked preview, and the account page's Plan comparison show the new lengths.
- [ ] An Attempt started at an old length (5 or 10) still resumes on its own countdown and question set,
      still scores, and still displays its length — tested.
- [ ] A start request for an old length is refused as `bad-length`.
- [ ] Prompt tests and the fake-server tests are updated; the end-to-end start flow uses a new length.
