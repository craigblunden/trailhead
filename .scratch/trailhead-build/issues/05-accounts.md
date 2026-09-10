# 05: Sign up, verify, sign in, sign out, land on an empty board

**Status:** ready-for-agent

**Blocked by:** 04

## What to build

A stranger creates an account with an email and a password, verifies that they own the address, signs
in, sees their own empty board, and signs out. Today both auth forms navigate to `/board` without
checking anything; that prototype seam closes here.

**Auth is Supabase Auth.** The Phase-2 spec's entire `better-auth` surface is void, along with its
route handler, its adapter config, and its email seam — Supabase sends verification and reset mail.
What survives from Phase 2 is the *principle*, not the mechanism:

- `requireSession()` reads the session server-side, is memoised so one render pass hits it once, and
  throws when there is no valid session.
- **No function accepts a `userId` from its caller.** The caller is untrusted even when the caller is
  our own code, because Server Actions are reachable by direct POST regardless of which component
  references them.
- `proxy.ts` — middleware is deprecated and renamed in this version of Next — performs *optimistic*,
  cookie-only redirects, and is explicitly **not** an authorization boundary. It runs on prefetches,
  and a cookie's presence is not proof of a valid session. Deleting `proxy.ts` entirely must not make
  any data reachable.

**A new account's board is empty**, and Phase 1's existing empty state with its "Add job" call to
action is what they see. `SEED_JOBS` is not seeded into new accounts.

**Do not leak whether an email is registered.** Sign-up with an existing address returns the same
generic failure as any other, or the form becomes an account-enumeration oracle.

Sign-out is currently a plain link to `/`. A link cannot perform a mutation, and mutations must not
happen during render — it becomes a real submit control.

## Acceptance criteria

- [ ] A new user signs up, receives a verification mail, verifies, signs in, and lands on an empty
      board — driven end to end in the e2e suite
- [ ] Sign-in before verification renders an explanatory state with a "resend verification" control,
      not a bare error
- [ ] Sign-up with an already-registered address is indistinguishable from any other failure
- [ ] Minimum password length is enforced server-side and matches the visible hint on the form
- [ ] `requireSession()` is memoised per render and throws when there is no valid session
- [ ] A signed-out visit to any `/board/*` URL lands on `/login`; a signed-in visit to `/login` or
      `/signup` lands on `/board`
- [ ] A test forges a session cookie and proves that `proxy.ts` guards nothing the data layer does not
      already guard
- [ ] The proxy matcher excludes auth callbacks, `_next` assets, and static files
- [ ] Auth checks live in page components and the data layer, never in a layout — layouts do not
      re-render on client-side navigation, so a layout check is not evaluated on every route change
- [ ] Sign-out clears the session, redirects to `/`, and is a submit control rather than a link
- [ ] Form errors render inline, associated with their field, and are announced to assistive tech
