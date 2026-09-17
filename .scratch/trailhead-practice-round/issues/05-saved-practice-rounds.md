# 05: Saved Practice rounds on the hub

**What to build:** The Interview Simulator hub lists the Tenant's finished Practice rounds, each
opening its read-back at a link of its own.

See `spec.md` → A Practice round ("Saved rounds").

**Blocked by:** 04 (the read-back it reuses)

**Status:** ready-for-agent

- [ ] A tenant-scoped read lists finished Practice rounds, newest first: id, date started, how many
      questions were answered. Tested for tenant isolation.
- [ ] The hub shows "Practice rounds" below the path for every Plan that has any: "Practice round",
      the date, "Not scored". Absent when there are none — no empty frame. The unfinished round is not
      listed (it is offered as Resume).
- [ ] `/interview/practice/<round>` shows that round's read-back view-only, with a way back to the hub
      and — for `free` and `basic` — to practise again. Another Tenant's round, an unknown one, or an
      unfinished one is a not-found. The route does not collide with `/interview/<job>`.
- [ ] That page has its own branch in the loading outline and the header's hiker wait, and arrives with
      the shared crossfade.
- [ ] A Tenant moved to `pro` still sees and opens their earlier rounds, and is offered no way to score
      or start one.
- [ ] End-to-end: finish a round, see it listed on the hub, open it, and read the same answers.
