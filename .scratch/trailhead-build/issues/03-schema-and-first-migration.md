# 03: Schema and first migration

**Status:** ready-for-agent

**Blocked by:** 02

## What to build

Every table this application needs across both phases, applied to an empty database as one committed
migration. A developer can run the migration from clean and open Prisma Studio to see the shape of
the product.

**The models are `Job`, `Contact`, `ActivityEntry`, and `Document`. Nothing else.** No `Analysis`, no
`Requirement`, no `Evidence`, no queue table, no job-state model — the analysis work left the phase
deliberately, and its absence must not be pre-built for.

**Supabase Auth owns the `auth` schema.** Prisma does not manage users, sessions, or accounts. A
row's owner is a `userId` holding the Supabase user id; there is no Prisma `User` model to relate to,
so there is also no cascade from a user downward. Deleting a user stays out of scope, as it was in
Phase 2.

**`userId` is denormalised onto every child table** — `Contact`, `ActivityEntry`, `Document` — rather
than reached through a parent. Ticket 04's policies need a column to test directly; an `exists(...)`
predicate over a parent is both slower and easier to get subtly wrong.

Shape that carries real meaning and is easy to lose:

- `Stage` and `Accent` are enums whose members match `src/lib/jobs.ts` exactly, spelling included.
  The stage set is load-bearing for both the enum and the board's columns.
- Salary bounds are nullable integers in thousands per year.
- `addedOn` and `appliedOn` are dates, not timestamps. A timestamp reintroduces the timezone drift
  Phase 1's date handling exists to prevent. `appliedOn` is nullable.
- `ActivityEntry` carries both the user-visible date and a creation timestamp, because two entries on
  the same day otherwise have no stable tiebreak and "newest first" is undefined.
- A `Contact` is user-owned, links many-to-many to `Job`, and carries a `kind` (recruiter, hiring
  manager, referrer, other) plus an optional free-text `agency`. Agency is a field, not an entity.
- A `Document` is user-owned, has a kind of resume or cover letter, and holds its storage key,
  extracted text, and an ingestion state. It is never versioned in place — a new upload is a new
  Document.
- Ids are database-generated cuids. The fixture slugs in `SEED_JOBS` are test data, not an id scheme.

## Acceptance criteria

- [ ] One committed migration applies cleanly to an empty database, and `prisma generate` produces a
      client at the configured output path
- [ ] A compile-time assertion proves the generated `Stage` enum is assignable to the `Stage` type in
      `src/lib/jobs.ts`, so drift fails the typecheck rather than a runtime query
- [ ] `Contact`, `ActivityEntry`, and `Document` each carry their own `userId` column
- [ ] Indexes cover every list query the board, the contacts route, and the documents route will make
- [ ] `migrate reset --force` followed by re-apply is clean
- [ ] Migrations are committed to git, and the repo's boundaries record that an applied migration is
      never edited
