# Plans: a Tenant on `pro` has bigger Limits

**Status:** implemented

Settled in a grilling session on 2026-09-12. The glossary terms are **Plan** and **Limit**
(`CONTEXT.md`); the placement decision is ADR-0001.

## What this is

A way to put chosen Tenants — the owner's own account first — on a Plan with bigger Limits, with
**no billing integration**. The framework is the part a later integration needs: a Plan that lives
somewhere the user cannot reach, Limits that come from the Plan rather than from constants, and the
two enforcement sites reading them.

## The Plans

| Plan   | Documents held | Cover letters per week |
| ------ | -------------- | ---------------------- |
| `free` | 3              | 5                      |
| `pro`  | unlimited      | 25                     |

`free` is today's numbers, unchanged. Both Limits are modelled as a number **or unlimited**; `pro`'s
letters are finite because each letter is a paid Opus call and "unlimited" would be a bill with no
ceiling. The numbers are code, in one pure module (`src/lib/plans.ts`); `DOCUMENT_CAP` and
`COVER_LETTER_QUOTA` become the `free` Plan's values and lose their standalone names.

## Decisions

- **A Plan is a row the app role can read and never write** (ADR-0001). Table `UserPlan`:
  `userId` (key), `plan` enum (`free`, `pro`), `updatedAt`. Nothing else — no `source`, no note;
  those arrive with the integration that needs them. No row means `free`. Tenant RLS on select;
  `trailhead_app` gets `select` only.
- **Flipping a Plan is a script**: `npm run db:plan -- <email> pro|free`, running against
  `DIRECT_URL` (the migrator role). With no arguments it lists every Tenant on `pro`. It finds the
  user by email in `auth.users`, so the migrator role gets `select` on `auth.users` in the migration.
  The SQL is documented as the dashboard fallback.
- **The seed gets a fifth account**, key `pro`, with four Documents held and seven letters used this
  week: both states that only a `pro` Tenant can be in, on screen without setup.
- **The Plan is read where Limits are enforced**, not put on the `Session`. A `limits()` data
  function returns the Tenant's Limits; the upload cap check and the letter reservation take their
  number from it. The reservation's `where used < N` keeps working with `N` per Tenant; unlimited
  skips the check.
- **Copy at the two Limit sites names the number, or drops it.** For `pro` on the documents page:
  the header loses "up to 3 at a time", the counter reads "4 documents", and the "All 3 slots used"
  state never renders. The cover-letter card keeps its copy with the bigger number. The word "Pro"
  appears nowhere yet: nothing explains what it is or how to get it.
- **A Plan change never deletes anything.** Over a Limit after a downgrade, the Tenant keeps what it
  has; uploads refuse until under the Limit (the existing check already behaves this way), and the
  week's used count stands against the new letters Limit.

## Not in this effort

- Billing, checkout, a "Pro" badge, an upgrade prompt, an admin page. Each needs the concept above
  to exist first, and none needs to exist for the owner to be on `pro`.
- A per-kind Document Limit (resumes separate from cover letters). Nobody asked, and the code has
  never distinguished them for the cap.

## Issues

1. `01-plans-and-limits-in-code.md` — the pure module and the constants' new home.
2. `02-userplan-table-and-the-limits-read.md` — migration, model, grants, `limits()`.
3. `03-the-two-limit-sites-read-the-plan.md` — upload cap and letter reservation take their Limit
   from the Plan; the copy follows.
4. `04-db-plan-script-and-the-seeded-pro-account.md` — the script and the fifth seed account.
