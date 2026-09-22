---
status: accepted
---

# A pending Upgrade request is derived from the Tenant's Plan, not stored as a status

An **Upgrade request** (`CONTEXT.md`) is pending while the Plan it names is above the Tenant's current
Plan and it is less than 14 days old. That is computed on every read from two columns — `plan` and
`requestedAt` — against the Tenant's Plan. There is no `status`, no `resolvedAt`, no `declinedAt`, and
the application role has `select` and `insert` on `UpgradeRequest` and deliberately **no** `update` or
`delete`.

## Why

The owner moves a Tenant between Plans by running `npm run db:plan -- <email> basic` (ADR-0001). A
stored status would mean that act is only half of the job: the row has to be marked resolved as well,
by a person, from a second place, with nothing to remind them. The status would drift from `UserPlan`
the first time it was forgotten, and a drifted status is worse than no status — it disables a button
for a Tenant who was upgraded weeks ago, and there is no screen on which anyone would notice.

Deriving it means the Plan is the single source of truth about whether someone still wants something
they do not have. Granting the Plan *is* resolving the request, because the request was only ever a
statement about the gap between the two.

## Considered options

- **A `status` column the owner flips.** Rejected: a second manual chore that drifts, and the
  application role cannot write it anyway, so the flip needs the migrator and a script of its own.
- **A row the application deletes when it is satisfied.** Rejected: it needs a `delete` grant on a
  tenant-writable table, and it throws away the history of who has been asking, which is exactly what
  makes a request worth reading.
- **Storing nothing, like App feedback.** Rejected: "the button is disabled while a request is
  outstanding" is the feature, and it has to survive a reload.
- **Deriving it, and lapsing at 14 days.** Chosen.

## Consequences

- **A lapse is required, not a nicety.** With nothing to flip and nothing to delete, a request the
  owner never actions would disable the button for good. The 14-day window is what turns silence into
  a soft no; `UPGRADE_REQUEST_LAPSES_AFTER_DAYS` lives beside the Plan ladder in `src/lib/plans.ts`.
- The table is insert-only **to the application**, so asking again after a lapse is a new row and the
  history accumulates. The email says how many times and since when, which is the thing worth knowing.
- `trailhead_migrator` is named in a policy of its own, as it is on `UserPlan`: forced row-level
  security binds the table's owner too, so without one the operator could not read the requests they
  are being emailed about. That policy is also where a future `db:plan --clear-requests` would write.
  It changes nothing about the application role, which still cannot update or delete a request.
- The rule is pure (`isUpgradeRequestPending(request, plan, now)`), decided in TypeScript against a
  clock passed in, and tested without a database — like `withinLimit` and the quota week.
- An owner who grants a *higher* Plan than was asked for resolves the request too, which is correct.
  An owner who moves a Tenant back down makes a recent request pending again until it lapses; harmless,
  and self-correcting.
- If this ever becomes a real billing flow, the request stops being a message and starts being an
  order, and this decision should be revisited along with ADR-0001.
