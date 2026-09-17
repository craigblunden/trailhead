# 03: Take a Practice round

**What to build:** A Tenant on `free` or `basic` starts a Practice round from the Interview Simulator
hub, answers its four questions against an eight-minute clock on the same run screen as an Attempt, and
can leave and resume it or start over. The first end-to-end slice: storage, the question set, start,
answer, time-up, resume.

See `spec.md` → Who gets what, A Practice round, The fixed question set. Storage per **ADR-0006**.

**Blocked by:** 01 (the run screen drives any timed run)

**Status:** ready-for-agent

- [ ] A Practice round and its questions are stored in tables of their own (the round: tenant, active
      seconds, completed-at, timestamps; each question: tenant, round, Category, order, text,
      transcript, answered-at), with the same forced row-level security, app-role grants, and
      account-deletion grants as the Attempt tables. Account deletion erases both, questions first.
      Tenant isolation tested like every table.
- [ ] The fixed question set lives in one pure module — six personal and six behavioural questions,
      exactly as in the spec. Picking two of each prefers questions not in the Tenant's previous round;
      tested.
- [ ] A Practice round's countdown is 8 minutes, derived from the Categories' answer times, and it
      satisfies the run shape from 01.
- [ ] Starting one: refused for `pro` with its own failure code and message; with an unfinished round
      and no reset, returns it as in progress; with reset, discards the unfinished one first. No weekly
      quota read or written, and no Claude client needed.
- [ ] Recording an Answer or a time-up on a Practice round follows the Attempt rules exactly —
      validation, active time, partial transcript kept, ending on the last Answer — sharing the request
      body schemas.
- [ ] The hub for `free` and `basic` offers the Practice round beside the locked preview: what it is
      ("4 general questions · 8 minutes · not scored"), speak or type, and Go — or Resume / Start over
      when one is unfinished. Waits follow the shared loading vocabulary.
- [ ] End-to-end: a free Tenant starts a round, answers one question, reloads and resumes on the second,
      starts over; a pro Tenant's start request is refused.
