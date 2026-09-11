# 12: Error handling, outage states, and fixtures moved out of production code

**Status:** in-progress (fixture move pending)

**Blocked by:** 11

## What to build

The application fails in ways a user can understand and a developer can diagnose, and `SEED_JOBS`
stops being something production code imports.

**Every failure has a designed landing place:**

- A database outage renders an error state on the board, not a stack trace and not a blank page.
- An unauthenticated session during a page render redirects to sign-in. From an action it returns a
  result prompting re-authentication, because an action cannot redirect the way a render can.
- Server-side errors are logged with enough context to diagnose — the operation, the tenant, the
  error — and nothing sensitive. No session token, no password, no full user record, at any log level.
- No error path reveals whether an email is registered or whether a given job id exists. The
  enumeration decisions in tickets 05 and 11 are only true if the error handler upholds them too.

**Fixtures become test-only.** `SEED_JOBS` moves to a test fixtures module and production code stops
importing it. New accounts start empty, which the board's existing empty state already handles. This
also closes the question of whether a "restore demo data" affordance is needed: it is not — the empty
state with its "Add job" call to action is the answer.

## Acceptance criteria

- [ ] With the database unreachable, the board renders a designed error state and the process does not
      crash
- [ ] An expired session redirects on render and returns a re-authentication result from an action,
      each with a test
- [ ] A log-scraping test, or an assertion at the logging seam, proves no session token, password, or
      full user record is ever logged
- [ ] `SEED_JOBS` is imported only by tests, enforced by a lint rule or a test that greps the source
- [ ] A fresh account sees the empty state, not seeded demo jobs
- [ ] No error message distinguishes a registered email from an unregistered one, or an existing job
      id from a nonexistent one

## Comments

### 2026-09-11 — agent (part 1: error handling; fixtures deferred, see below)

**Built.**

- **Database outage:** `prefetchJobs()` awaits the read but a failure is not thrown into the
  render — TanStack marks the query errored and dehydrates nothing (PRE-2). The client then fetches
  through the action, receives a `failed` result, and `BoardView` renders its designed error state
  with "Try again" (TSQ-7). The process does not crash.
- **Ended session:** a render redirects to `/login?session=ended` (SES-2, and e2e ACC-6 with a
  forged cookie); an action returns `{ error: "unauthenticated" }` (ERR-3, and the integration
  case "asks for re-authentication when there is no session"), and the browser client sends the
  user to sign in.
- **Logging:** `src/server/log.ts` writes one JSON line — operation, tenant id, error name and
  message — and never the raw error object (a Prisma error carries the query and its parameters).
  Keys that look like secrets are redacted by name. `tests/server/log.test.ts` asserts a token, a
  password, a stack, and a constraint name are all absent from the line; ERR-1 asserts the client
  result contains no Prisma text or port while the log has the operation and tenant.
- **No enumeration through errors:** a missing id and a foreign id produce `toEqual` results
  through the actions (ERR-2, and the integration case); the auth actions were already uniform.
- A fresh account sees the empty state (e2e ACC-1).

**Deferred: `SEED_JOBS` becomes test-only.** The move itself is small, but the landing page
rewrite currently in progress in the working tree (`src/components/landing/everything-you-need.tsx`,
uncommitted, not part of this effort) imports `SEED_JOBS` for its miniatures. Moving the fixture
now would break that in-flight file's typecheck and therefore the build the e2e suite depends on.
It is scheduled for the end of this set (ticket 21), when the landing work has settled: the
fixture moves to `tests/fixtures/jobs.ts`, the landing's illustrative data becomes its own
`SAMPLE_JOBS` module, and a source-grep test enforces the rule.

**Status:** in-progress (fixture move pending)
