---
status: accepted
---

# A Tenant's Plan is a row the application role can read but never write

A Tenant's Plan (`CONTEXT.md`) decides its Limits, and a Plan must be something the user cannot
change for themselves. We keep it in a Postgres table, `UserPlan`, keyed by the Supabase user id,
readable by `trailhead_app` under the same tenant policy as every other table, and writable today
only by `trailhead_migrator` (through `npm run db:plan`) or by hand in the dashboard. No row means
`free`, so sign-up touches nothing.

## Considered options

- **Supabase Auth `app_metadata` on the user.** Free to read (`getUser()` already returns it) and
  not user-writable. Rejected because writing it takes the Auth admin API and therefore the
  `service_role` key, which this application has none of by design (`docs/architecture.md`). The
  billing integration that will one day set Plans would have had to reverse that decision first.
- **An allowlist of user ids in an environment variable.** Fastest, but a deploy per change and no
  path to billing at all.

## Consequences

- The application has no code path that sets a Plan. The boundary is a missing grant, not a
  convention: `trailhead_app` has `select` on `UserPlan` and nothing else.
- A future billing webhook gets its own narrow write path (a `security definer` function, or a
  grant scoped to that handler), added with that integration and with its own ADR if the shape is
  surprising.
- The Limit numbers themselves are code (`src/lib/plans.ts`), not rows. Raising what `pro` gets
  is a deploy; moving one Tenant between Plans is a row.
