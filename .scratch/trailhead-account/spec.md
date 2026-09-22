# Account: see your account and Plan, and delete the Account for good

**Status:** implemented

Settled in a grilling session on 2026-09-15. The glossary terms are **Account** and **Account
deletion** (`CONTEXT.md`, added in that session), beside **Tenant**, **Plan**, and **Limit**. The
privilege decision is ADR-0004.

## What this is

A signed-in page, `/account`, whose job is Account deletion: ending the Account and erasing its
Tenant — every row, every file, and the Supabase Auth user — at once and for good. Around that it
shows who is signed in, the Tenant's Plan and usage, and a static preview of Plans that can one day
be paid for.

## The page

Reached from the user menu only (not `PRIMARY_NAV`). Four sections, top to bottom:

1. **Your account** — name, email, and how the Account signs in (email, Google, GitHub). Read-only:
   changing name or password is not in this effort.
2. **Your Plan** — the current Plan, Documents held against the Documents Limit, and letters left
   this quota week against the letters Limit. The same reads the Documents page and the cover-letter
   card already use.
3. **Plans — coming soon** — `free`, `basic`, and `pro` side by side, each with its Limits rendered
   from `PLAN_LIMITS` (never restated in copy), the current Plan marked with the trail blaze the user
   menu uses. One line: "Paying for a Plan is coming soon." No prices, no unbuilt features (the Pro
   reviews in ADR-0003 are only proposed), no "notify me", nothing that links. Static, like the
   Supporting documents preview in `application-kit.tsx`.
4. **Delete account** — visually separated, last.

## Deleting

**The dialog** lists what goes, with counts ("12 Jobs, 3 Documents, 8 Contacts"); names the Plan
when it is `basic` or `pro` ("Your Pro plan ends with your account"); points at the Documents page
for anyone who wants their files first; says App feedback already sent is not recalled; and enables
the destructive button only once the Account's email is typed exactly (case-insensitive, trimmed).
No password re-entry — social Accounts have none.

**The order**, because no transaction spans Storage and Postgres:

1. **Storage, as the user.** Every object under `<userId>/` in the `documents` bucket is listed and
   removed through the Storage API with the user's own session. On failure: stop, nothing else is
   touched, the user is told to try again.
2. **Postgres, one transaction.** Inside `withTenant()`, one call to a `security definer` function
   owned by `postgres` (ADR-0004) deletes every tenant row — Job, ActivityEntry, Contact, JobContact,
   Document, GenerationQuota, UserPlan — and then the `auth.users` row, whose identities and sessions
   cascade. It takes no argument: the tenant is `tenant_id()`. On failure after step 1: the board is
   intact, the files may be gone, and the message says so; a retry finishes, since removing a missing
   object is a no-op.
3. **Sign out and land on `/`** with a one-line notice: "Your account and everything in it has been
   deleted." No goodbye page, no email.

**Logging:** one JSON line per outcome — `logEvent` on success, `logError` on failure — with
operation `account.delete`, the tenant id, and which step failed if one did. Never the email.

## Decisions

- **Immediate, no grace period.** A grace period needs a scheduled job, and `pg_cron` cannot remove
  files — it would protect half the data.
- **No `service_role` key** (ADR-0004). STO-1 stays green.
- **Deleting and signing up again is allowed** and yields a new Tenant: the letter quota resets and a
  Hold lapses. Remembering the email to prevent it would be keeping data after deletion.
- **A Plan granted by hand is lost** with the Account; the dialog warns, nothing blocks.
- **Accountless rows are swept.** An access token outlives its Auth user until it expires, so another
  tab can write after deletion. The `pg_cron` janitor deletes tenant rows whose `userId` has no
  `auth.users` row.

## Accepted risks (recorded in `docs/deferred.md`)

- A file landed after deletion through a signed upload URL minted before it (tokens live 2 h) has no
  owner who can remove it. Same class as "orphaned objects for users who never return".
- Likewise an upload started from a second tab with a still-valid access token.

## Not in this effort

- Data export. Documents are downloadable one at a time already; export stays deferred.
- Changing name, email, or password; linking or unlinking social sign-in.
- Billing, prices, checkout, changing Plan, a waitlist.
- A confirmation email (Resend is not provisioned for it).

## Issues

1. `01-hosted-probe-auth-users-delete.md` — confirm hosted allows what local does. Blocks 02.
2. `02-the-erase-function.md` — the definer function, its grants, and its integration tests.
3. `03-the-janitor-sweeps-accountless-rows.md` — `pg_cron` deletes rows with no Account.
4. `04-delete-account-in-the-data-layer.md` — Storage, then the function, then sign-out; the
   counts the dialog reads.
5. `05-the-account-page.md` — the route, the first three sections, the user menu link.
6. `06-the-delete-dialog-and-the-landing-notice.md` — the fourth section, end to end in the browser.
7. `07-docs-and-the-end-to-end-journey.md` — e2e, architecture, deferred, ADR-0004 accepted.
