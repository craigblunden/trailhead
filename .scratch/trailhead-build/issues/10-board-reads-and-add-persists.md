# 10: The board reads real jobs, and adding one survives a reload

**Status:** ready-for-review

**Blocked by:** 05, 08, 09

## What to build

The first tracer bullet through the whole stack. A signed-in user's board shows jobs from Postgres,
they add one through the existing dialog, they close the tab, they come back tomorrow, and it is
still there.

This is the ticket that makes the product real, and it establishes the layering every later ticket
follows:

```
Client Component ──▶ Server Action ──▶ Data Access Layer ──▶ Prisma ──▶ Postgres
   (untrusted)       (validates)       (authenticates,
                                        scopes by tenant)
```

- Only the data access layer imports Prisma. Not actions, not pages, not components.
- Actions hold no query logic and no `where` clause. An action that grows a database call has found
  the wrong home for it.
- Every data-layer function calls `requireSession()` first and runs inside `withTenant()`. Ownership
  lives in the `where` clause, never as a post-fetch comparison — a query that *can* return another
  user's row is a bug even when followed by a correct check.
- The data layer returns DTOs and typed domain errors, never Prisma records and never raw strings.
- Actions return a discriminated result. A Prisma error, a stack trace, a constraint name, or a
  column name never reaches the client.
- Server Actions are the only write path from the client.

**Creating a job is one transaction** that writes the job and its single opening activity entry
together. A crash between them must not leave a job with no history. It starts at the `interested`
stage, dated today, with no applied date, and its accent assigned by round-robin over the accent keys
so the board keeps its Phase-1 visual variety.

## Acceptance criteria

- [ ] A signed-in user's board renders their own jobs from the database, ordered stably across reloads
- [ ] Adding a job through the existing dialog persists it, and it is present after a full reload —
      proven end to end in the e2e suite
- [ ] A new job has exactly one activity entry, written in the same transaction as the job
- [ ] Blank location and blank or non-numeric salary bounds are handled server-side, not only by the
      client
- [ ] Server-side fallbacks and defaults are tested against a frozen clock
- [ ] A cross-user integration test proves user B cannot list or create against user A's data
- [ ] Importing anything from the data layer into a Client Component fails the build, and a test
      asserts the guard is in place
- [ ] No Prisma import exists outside the data layer, and no action contains a `where` clause

## Comments

### 2026-09-11 — agent

**Built: the first tracer bullet.** A signed-in user's board reads from Postgres, and a job added
through the existing dialog is there after a reload.

The layering, as shipped:

- `src/server/data/jobs.ts` — the data access layer: `listJobs`, `getJob`, `createJob`,
  `updateJob`, `setJobStage`. Every function calls `requireSession()` first, runs inside
  `withTenant()`, and still names `userId` in every `where` — ownership lives in the query.
  Returns mapper DTOs and throws `NotFoundError` / `UnauthenticatedError`; Prisma types stop here.
  Only `src/server/db/` and `src/server/data/` import Prisma.
- `src/server/actions/jobs.ts` (`"use server"`) — `listJobsAction`, `createJobAction`,
  `updateJobAction`, `setJobStageAction`. Each validates `unknown` input through ticket 08's
  schemas and returns a discriminated `ActionResult`: `unauthenticated` (an action cannot
  redirect), `invalid` with field errors, `not-found`, or `failed` with a generic message after a
  structured log line. No `where`, no query logic, no Prisma import.
- `src/components/jobs-actions-client.ts` — the browser's `JobsClient` over the actions;
  `unwrap()` throws an `ActionError` carrying the safe message (which the provider shows on
  rollback) and sends an ended session to `/login`. `JobsProvider` now defaults to it.
- `src/server/db/prisma.ts` — the client is created on first use, so a module graph that merely
  reaches it (a Client Component importing an action) needs no `DATABASE_URL` until a query runs.
- Pages (`board/page.tsx`, `board/[id]/page.tsx`) call `requirePageSession()` then prefetch
  `listJobs()` unawaited; the client hydrates the same `["jobs"]` key.
- Creating a job is one `create` with a nested activity `create` — one statement in one
  transaction — starting at `interested`, dated today (UTC), no applied date, accent by
  round-robin over how many jobs the user already has.

Tests: `tests/integration/jobs.test.ts` (8 for this ticket, real database, only the session
faked at its seam): one activity entry per new job; defaults against a frozen clock including the
accent round-robin; stable order across reads; DTO shape; **user B cannot list, read, or create
against user A's data — there is no argument through which B could even claim to**; blank
location and non-numeric salary handled server-side through the action (and a client-only
`resumeFile` stripped); bad input returns field errors and writes nothing; no session returns
`unauthenticated`. `tests/server/boundaries.test.ts` (5, reads the source tree): only the data
layer imports Prisma; every data-layer module is `server-only`; no `"use client"` file imports
the data layer; actions contain no `where:` and no Prisma import; no data-layer function takes a
`userId`. E2E (`e2e/journey.spec.ts`, `e2e/fixtures.ts`): add through the dialog, open, reload.

**Status:** ready-for-review
