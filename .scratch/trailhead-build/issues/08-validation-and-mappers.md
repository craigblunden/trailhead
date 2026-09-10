# 08: Validation schemas and mappers

**Status:** ready-for-agent

**Blocked by:** 03

## What to build

Two pure modules that every write and every read will pass through, unit-tested without a database or
a session. This ticket depends only on the schema's enum names, so it runs in parallel with the whole
of the auth branch — it is the one genuinely parallelisable piece of the graph.

**Mappers** turn database rows into the DTOs `src/lib/jobs.ts` already defines. The contract is that
Phase-1 components keep working against them:

- Date columns serialize to `YYYY-MM-DD` **strings** in UTC. The existing date formatters parse
  exactly that shape; handing them a `Date` or an ISO timestamp breaks rendering and reintroduces the
  server/client hydration mismatch the string form exists to prevent.
- Activity is ordered newest-first by the user-visible date, then by creation timestamp — the
  tiebreak that makes "newest first" defined for two entries on the same day.
- Contacts are ordered stably, so the detail view does not reshuffle across reloads.
- A Prisma model type never crosses out of the data layer. Mappers are the boundary.

**Validation** bounds every input crossing the server boundary. Actions are public POST endpoints and
their arguments are untrusted regardless of which component calls them.

- Every free-text field gets a length bound. An unbounded text column is a denial-of-service surface.
- The posting URL is sanitised **on write**, not only at render. `<input type="url">` accepts
  `javascript:`, and a stored hostile URL is a stored XSS vector for every future consumer of that
  field.
- Blank location falls back to the Phase-1 default; blank or non-numeric salary bounds become null.
  The client already coerces these, but client-side coercion is convenience, not the contract.

## Acceptance criteria

- [ ] Mappers are pure functions over plain rows, with no database or session access, and are unit
      tested with no database running
- [ ] A mapped job is structurally identical to the Phase-1 `Job` type — no field added, removed, or
      renamed — and Phase-1 components typecheck against it untouched
- [ ] Date fields round-trip to `YYYY-MM-DD` strings, tested against a frozen clock
- [ ] Activity ordering is deterministic for two entries sharing a date
- [ ] Every free-text field has a length bound, tested at and past the limit
- [ ] A `javascript:` posting URL is rejected or neutralised at the validation boundary, with a test
