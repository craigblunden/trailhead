# 06: Forgot and reset password

**Status:** ready-for-review

**Blocked by:** 05

## What to build

A user who has forgotten their password requests a reset link, follows it, sets a new password, and
signs in with it.

Two routes that do not exist yet, both of which have a wrong-answer trap:

- **The request form always renders the same confirmation**, whether or not the address has an
  account. Same enumeration reasoning as ticket 05's sign-up failure — a "no account with that email"
  message is a lookup service.
- **The reset form must survive a bad token.** Expired, already used, or malformed all render a
  recoverable error with a link to request a fresh one. None of them is a crash or a 500, and a user
  who clicks yesterday's link is the normal case, not the edge case.

Both routes inherit Phase 1's accessibility bar rather than being new territory: zero axe violations,
no horizontal overflow at 320, 768, 1024, or 1440px, and pending and error states announced to
assistive tech rather than shown only as a spinner.

## Acceptance criteria

- [ ] Requesting a reset for a registered and an unregistered address produces byte-identical
      responses and identical rendering
- [ ] A valid token sets a new password, subject to the same minimum length as sign-up, and the user
      can then sign in with it
- [ ] An expired, reused, or malformed token renders a recoverable error offering a fresh request
- [ ] The old password no longer works after a successful reset
- [ ] Both routes produce zero axe violations and no horizontal overflow at all four widths
- [ ] Submission state is announced to assistive tech, not conveyed by a spinner alone

## Comments

### 2026-09-11 — agent

**Built.**

- `/forgot-password` (`ForgotPasswordForm` + `requestPasswordResetAction`): `resetPasswordForEmail`
  with `redirectTo` = `/auth/confirm`; the action always returns `{ status: "sent", email }` and
  the confirmation renders from the typed address alone. Unit test PWD-2 compares the DOM for a
  registered and an unregistered address; e2e PWR-1 compares the rendered text on the real stack
  and checks that only the registered one receives mail.
- `/reset-password` (`ResetPasswordForm` + `updatePasswordAction`): the recovery link's token hash
  is verified by `/auth/confirm` (type `recovery`), which signs the user in and lands here. Same
  minimum length as sign-up, enforced by zod and by Supabase. On success the recovery session is
  ended and the user signs in with the new password on `/login?reset=1` — the proof it took.
- **Bad tokens are the normal case.** Expired, reused, or malformed → `/forgot-password?error=link`
  with a recoverable notice and a working form; a bare visit to `/reset-password` with no session →
  `?error=session`. Never a 500 (asserted). E2E PWR-2 reuses a consumed link; PWR-3 sends a
  malformed one and visits the reset page cold.
- Accessibility: unit axe on both forms; e2e axe (all four WCAG tag sets) and no overflow at 320,
  768, 1024, 1440 on both routes, including the reset page reached through a real link. Pending and
  confirmation states are live regions (`role="status"`), not spinners.

**Status:** ready-for-review
