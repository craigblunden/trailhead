# 07: Social sign-in, feature-flagged off without credentials

**Status:** ready-for-agent

**Blocked by:** 05

## What to build

A user signs in with Google or GitHub instead of managing another password, and a developer who
clones the repo without OAuth credentials still gets a working app.

**The flag is not optional polish.** OAuth apps and callback URLs cannot be created from this repo, so
a clean clone will not have them. When the client id and secret for a provider are absent, that
provider's button does not render and nothing about the app is broken. This is what makes "clone and
run" true.

**Account linking is the trap.** An account created by email and password, and a social identity
carrying the same *verified* address, must resolve to one user — not two accounts silently diverging,
with the user's board in whichever one they signed into first. Supabase has a position on this;
confirm what it actually does rather than assuming, and test it.

OAuth requires a browser redirect, so sign-in is initiated client-side, unlike every other auth path
in this phase.

## Acceptance criteria

- [ ] Google and GitHub sign-in both complete and land the user on their own board
- [ ] Signing in socially with an address that already has an email-and-password account reaches the
      same user and the same jobs, proven by a test
- [ ] With a provider's credentials absent from the environment, its button does not render and the
      app runs normally
- [ ] Provider buttons have accessible names that name the provider, not an unlabelled icon
- [ ] Buttons appear on both `/signup` and `/login`
