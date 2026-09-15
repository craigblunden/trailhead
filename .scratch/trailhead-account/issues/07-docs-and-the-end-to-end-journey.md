# 07: The end-to-end journey, and the docs

**Status:** ready
**Blocked by:** 03, 06

## What to build

**`e2e/account.spec.ts`** against the local stack:

1. Sign up a fresh Account (the e2e fixtures' disposable user), add a Job, add a Contact linked to
   it, upload a Document and attach it.
2. Open `/account` from the user menu. The summary shows 1 Job, 1 Document, 1 Contact, the free Plan.
3. Open the dialog; the button stays disabled with a wrong email; type the right one; confirm.
4. Land on `/` with the notice. `/board` redirects to sign-in.
5. Signing in with the same email and password fails as an unknown Account.
6. Directly against the database: no rows, no `storage.objects`, no `auth.users` row for that id.

The global teardown must not choke on a user that no longer exists.

**Docs:**

- `docs/architecture.md` — a "Deleting an Account" section with the three-step sequence, and the
  janitor's second job in the system diagram and the sweep section.
- `docs/deferred.md` — the "Account deletion and data export" row becomes "Data export"; the orphaned
  objects row gains the two post-deletion cases (an upload URL minted before deletion, an upload from
  a tab whose token outlived the Account).
- `docs/provisioning.md` — the hosted probe from issue 01 and its result; the new migrations to push.
- ADR-0004 `status: accepted`, once issue 01 and this journey pass.

## Comments
