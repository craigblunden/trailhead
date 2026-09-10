# 12: Error handling, outage states, and fixtures moved out of production code

**Status:** ready-for-agent

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
