# 21: `verify`, CI, and the record of what this work superseded

**Status:** ready-for-agent

**Blocked by:** 20

## What to build

One command proves the whole application, CI runs it on every push, and the Phase-1 and Phase-2 specs
say plainly which of their requirements this work replaced.

**`npm run verify` gains the integration level** and must still pass end to end. A phase that ships
with `verify` red is not shipped. Integration tests need a live Postgres, which is what makes this a
CI ticket rather than a config line — a service container, migrations applied before the run, and the
integration project kept separate so unit tests stay fast.

**The Supersedes record is the part that gets skipped, so it is an acceptance criterion.** A
requirement that quietly stopped being true is worse than one that was never written. At minimum:

- Phase 1's auth seam — "submitting either form navigates to `/board`, no credentials are checked" —
  is gone.
- Phase 1's disabled add-contact button, the resume field's filename-only behaviour, and the disabled
  cover-letter button are all now real.
- Phase 1's open question about persistence is answered: straight to a real backend, no interim
  browser storage.
- Phase 1's seed fixtures become test-only, and new accounts start empty.
- Phase 2's entire `better-auth` surface is void, replaced by Supabase Auth.
- Phase 2's frozen provider contract, its "no consumer component changed" success criterion, and its
  "call `refresh()` after every mutation" rule are all void, replaced by TanStack Query.
- Phase 2's assumption that Prisma manages the auth schema is void; Supabase Auth owns it.
- Phase 2's deployment-target question is answered: Vercel and Supabase.

**Say the deferrals plainly.** Gap analysis and the portfolio review — the Requirement/Evidence
taxonomy and the suggested sample projects — were the *headline ask* in the original brief, and they
are not here. Their absence must read as a decision with its open questions preserved, not as an
oversight. The same goes for streaming the generated letter, and for drag-and-drop and dark mode,
which have been open since Phase 1 and remain so.

## Acceptance criteria

- [ ] `npm run verify` runs lint, typecheck, unit, integration, and e2e, and passes
- [ ] CI runs `verify` on every push, with a Postgres service container and migrations applied first
- [ ] The unit suite still runs without a database and without slowing down
- [ ] Both specs carry a Supersedes table covering every item above, each naming what replaced it
- [ ] No requirement was deleted without a line saying what took its place
- [ ] The deferred work is recorded with its open questions intact, in a place a future phase will find
- [ ] A clean clone can reach a running application from the `.env.example` and the documented commands
      alone
