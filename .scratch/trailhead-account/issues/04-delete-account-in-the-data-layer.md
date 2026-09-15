# 04: Delete account in the data layer

**Status:** ready-for-review
**Blocked by:** 02

## What to build

`src/server/data/account.ts`, following the data layer's rules (`requireSession()` first, no
external call inside `withTenant()`):

- **`accountSummary()`** — what the page and the dialog read: name, email, sign-in method, Plan, and
  counts of Jobs, Documents (held, as the Documents Limit counts them), and Contacts. The sign-in
  method comes from the token's claims (`app_metadata.provider` / `amr`) — confirm which is reliable
  for an Account with both email and a linked social identity, and show all of them if there are
  several.
- **`deleteAccount()`**, in the spec's order:
  1. List every object under `<userId>/` in the `documents` bucket through `documentsBucket()` —
     paginate; `list` returns a page, not everything — and `remove` them. Include the keys of the
     Tenant's Document rows, tombstones too, in case a listing misses a just-landed object. Any
     error: throw a typed failure naming step `storage`; nothing else runs.
  2. `withTenant(userId, tx => tx.$queryRaw\`select public.erase_my_account()\`)`. Error: throw a
     typed failure naming step `erase`.
  3. `supabase.auth.signOut()` — failure here is logged and swallowed: the Account is already gone,
     and the cookie is cleared by the redirect's `SESSION_ENDED` handling at worst.
  4. `logEvent({ operation: "account.delete", tenant: userId })`. Failures `logError` with the step.

`src/server/actions/account.ts` — `deleteAccountAction(confirmEmail)`: zod-validated; refuses unless
the typed email matches the session's (trimmed, case-insensitive) with a `RuleError`; calls
`deleteAccount()`; on success `redirect("/?deleted=1")`. The two failure steps map to written
messages in `action-result.ts`:

- `storage` — "We couldn't delete your files, so nothing was deleted. Please try again."
- `erase` — "Your files may already be gone, but your board is still here. Please try again to finish."

## Seams under test

1. Integration (local stack, real Storage, session mocked as in `session-mock.ts`): a Tenant with two
   uploaded Documents and a tombstone — after `deleteAccount()`, `storage.objects` has nothing under
   the prefix, every table is empty for the tenant, the Auth user is gone; another Tenant's objects
   and rows remain.
2. Storage failure (fake bucket that errors): nothing in Postgres changes.
3. Erase failure after Storage succeeds: rows remain; calling again completes.
4. The action refuses a mismatched email without touching anything; accepts `" Alex@Example.com "`
   for `alex@example.com`.
5. STO-1 still passes.

## Comments

**2026-09-15 (implementation):** Sign-in methods come from `app_metadata.providers` (every linked identity, verified on local accounts with email + a social identity), falling back to `app_metadata.provider`; `amr` is only how this session signed in. `Session` gained `providers`. The held-Documents predicate is shared as `heldBy()` in `documents.ts`. The erase failure is tested for real by revoking EXECUTE from `trailhead_app` for the duration (DEL-4, ACCT-7). `logError` now accepts extra fields, for `step`.
