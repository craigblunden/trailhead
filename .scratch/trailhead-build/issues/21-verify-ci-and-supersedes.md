# 21: `verify`, CI, and the record of what this work superseded

**Status:** ready-for-review

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

## Comments

### 2026-09-11 — agent (from ticket 07)

**CI must let the local Auth container reach the test-only OAuth provider.** Ticket 07's
integration (`tests/integration/social-linking.test.ts`) and e2e (`e2e/social-sign-in.spec.ts`)
suites start a fake identity provider on the runner at `127.0.0.1:54399`. Auth, in Docker, reaches it as
`http://host.docker.internal:54399` (`supabase/config.toml`, `[auth.external.gitlab]`). Docker
Desktop provides that name. **A Linux runner may not.** Confirm the Supabase CLI adds a
`host-gateway` mapping to the auth container there, and that a loopback-bound listener is
reachable through it. If it is not, the fake must listen on the Docker bridge address instead.
Check this before assuming a red CI run is a linking regression.

### 2026-09-11 — agent

**Built.**

- **`npm run verify`** already chained lint → typecheck → unit → integration → e2e; the integration
  level has been part of it since ticket 04. It was run on a **clean worktree of the committed code**
  (`bcf6169`, without the uncommitted landing rewrite in the main working tree):
  **lint, typecheck, unit (272), and integration (71) passed; e2e passed 78 of 79.** The one failure
  is `RESP-1: landing does not overflow horizontally at 320px` — the committed landing page's
  "Everything you need for the climb" section is wider than a 320px screen. That file is unchanged
  by this work (it predates `e827e04`), it fails on every run, and the uncommitted landing rewrite in
  the working tree replaces that section; it is left for that rewrite rather than patched underneath
  it. The same rewrite currently fails `A11Y-1: landing` on contrast (10.4px text at 4.33:1), so
  **`verify` is not green on either tree until the landing work lands.** Everything this effort
  built is.
- **CI:** `.github/workflows/verify.yml` runs `npm run verify` on every push and pull request on
  `ubuntu-latest`, Node 22: `npm ci` → `npx supabase start` (Postgres, Auth, Storage, and Mailpit as
  containers; applies the provisioning migration and the local role passwords) → `cp .env.example
  .env.local` → `npm run db:deploy` (migrations before any test) → Playwright's Chromium →
  `npm run verify`, keeping `test-results/` on failure. A bare Postgres service container was not
  enough: the integration and e2e suites need Auth and Storage too, and the Supabase CLI's Postgres
  *is* a container alongside them.
- **The unit suite stays fast and database-free:** `npm test` is the jsdom project only (272 tests,
  ~2 minutes on this Windows machine, no database), unchanged in shape.
- **The Supersedes record:** `docs/supersedes.md`. Neither spec is in the working tree — Phase 1's
  `docs/spec.md` was removed in `2aebb4f` and Phase 2's `.scratch/trailhead-backend/spec.md` was never
  committed — so the record is its own document with a table per spec instead of a section appended
  to each: every item this ticket lists (AUTH-3's unchecked auth seam, DET-7, ADD-5/the filename-only
  resume field, DET-9, the persistence question, the seed fixtures, the `better-auth` surface, Prisma
  owning auth, the frozen provider contract and its "no consumer changed" criterion, `refresh()` after
  every mutation, the deployment question), each naming what replaced it and the ticket that did,
  plus the Phase-1 items that still hold.
- **The deferrals:** `docs/deferred.md` — gap analysis and the portfolio review as the headline ask,
  with every open question from phase3/12 intact (that folder is untracked, so the questions are
  copied where a future phase will find them), streaming, drag-and-drop, dark mode, the orphaned-object
  residual from ticket 16, and what has been verified only locally.
- **A clean clone** reaches a running app from `.env.example` and the README's five commands (the
  same ones as `docs/provisioning.md`). `.env.example` gains `TEST_POSTGRES_URL`, the local
  `postgres` connection the janitor test and the e2e teardown use. The README is rewritten: it had
  described the interface-only prototype.

**Not verified — CI itself.** No run on GitHub was possible from here. Two things to watch on the
first one: (1) ticket 07's note — the social-linking suites need the Auth container to reach the fake
OAuth provider on the runner via `host.docker.internal`; if the Supabase CLI does not map it on Linux,
those tests fail for that reason, not because linking broke. (2) Runner time: the e2e build and suite
take a few minutes on top of the stack's start; the job allows 45.

**Status:** ready-for-review
