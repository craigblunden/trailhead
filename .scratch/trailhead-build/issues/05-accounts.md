# 05: Sign up, verify, sign in, sign out, land on an empty board

**Status:** ready-for-review

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

## Comments

### 2026-09-11 — agent

**Built on Supabase Auth via `@supabase/ssr`.** No `better-auth`, no auth route handler, no
adapter, no email seam: Supabase sends the mail.

- `src/server/auth/supabase.ts` — the request-bound server client (publishable key only).
- `src/server/auth/session.ts` — `getOptionalSession()` memoised per render with React `cache`
  and validated with `getUser()` (so a cookie is not proof); `requireSession()` throws
  `UnauthenticatedError`; `requirePageSession()` redirects. **No function accepts a `userId`.**
- `src/proxy.ts` (middleware is renamed in this Next) — optimistic, cookie-**presence** redirects
  over `/board`, `/contacts`, `/documents` → `/login` and `/login`, `/signup` → `/board`; matcher
  excludes auth callbacks, `_next`, and static files by construction. It also refreshes an expiring
  session on the response, because a Server Component cannot write cookies and a lost rotated
  refresh token would later be flagged as reuse and revoke the session. Its answer is never used
  for authorization. The decision rules are pure functions in `src/lib/auth-routing.ts`.
- `src/server/auth/actions.ts` — `signUpAction`, `signInAction`, `resendVerificationAction`,
  `signOutAction`. Sign-up always answers "check your email" (an existing address is
  indistinguishable — Auth's obfuscated success, and an explicit "already registered" error is
  folded into the same state). Sign-in maps "not confirmed" to an explanatory state with a resend
  control and a bad password to "don't match". Password minimum is enforced by zod **and** by
  Supabase's `minimum_password_length = 8`, matching the form's hint.
- `src/app/auth/confirm/route.ts` — verification and reset links carry a token hash here (custom
  templates in `supabase/templates/`), so a link works from any device, not only the browser that
  signed up. Verifying signs the user in and lands them on their empty board. Bad, expired, or
  reused links redirect to the relevant form with a notice — never a 500.
- Auth checks live in `board/page.tsx` and `board/[id]/page.tsx` (`requirePageSession()`), and
  `/login` and `/signup` redirect a signed-in visitor. The board layout reads the session for the
  header only and gates nothing.
- Sign-out is a `<form action={signOutAction}>` submit control inside the user menu, not a link.
- `AuthForm` runs on `useActionState`: inline field errors via `aria-describedby`/`aria-invalid`,
  a form-level `role="alert"`, pending text announced through a live region, the "check your
  email" and "unverified" states with resend.

Tests: `tests/lib/auth-routing.test.ts` (5), `tests/components/auth-form.test.tsx` (15, actions
faked at the prop seam). E2E `e2e/auth.spec.ts` drives the real flow through Mailpit: sign up →
verify → empty board → sign out → sign in; unverified sign-in with resend (mail arrives);
registered vs. fresh address render identically; short password refused server-side; signed-out
`/board/*` → `/login`; **forged cookie passes the proxy and is stopped by the page**; signed-in
`/login` → `/board`; sign-out clears the session. `e2e/fixtures.ts` gives every spec a verified
account per worker, created through the real sign-up.

Config: confirmations on, 8-character minimum, custom confirmation/recovery templates, local
email rate limit raised so the suite can create accounts (`supabase/config.toml`).

**Status:** ready-for-review
