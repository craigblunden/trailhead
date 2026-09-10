# 10: The board reads real jobs, and adding one survives a reload

**Status:** ready-for-agent

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
