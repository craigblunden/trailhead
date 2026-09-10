# 06: Forgot and reset password

**Status:** ready-for-agent

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
