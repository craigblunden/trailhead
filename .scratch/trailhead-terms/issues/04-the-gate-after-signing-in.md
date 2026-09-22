# 04: The gate after signing in

**What to build:** The blocking acceptance step every authenticated route sits behind.

See `spec.md` → Where acceptance is taken. **ADR-0008**.

**Blocked by:** 01, 02, 03

**Status:** ready-for-review

- [ ] On the `(app)` layout's path: a session with no acceptance of `TERMS_VERSION` reaches the
      acceptance step and nothing else. One place, not a check each route remembers.
- [ ] An explicit, **unticked**, submit-blocking control. Not "by continuing you agree" — the point is
      surfacing what goes to which AI provider, and an implicit line surfaces nothing and records
      nothing.
- [ ] The step shows a short summary of what is sent where, and links to `/terms` and `/privacy` in full.
      Reading them must not lose the person's place.
- [ ] Accepting writes the row and returns them to where they were going.
- [ ] Declining offers only to sign out. That is the honest consequence of a gate.
- [ ] This is also the **backfill**: an Account created before the terms existed hits the same step on
      its next visit. No separate one-off migration, and a test covers an Account with no acceptance
      row at all.
- [ ] Bumping `TERMS_VERSION` re-prompts everyone — a test pins this by bumping the constant and
      asserting an Account with the previous version is gated again.
- [ ] Both an email sign-up and a Google sign-in reach the gate. This is the reason the gate exists
      rather than a form field, so the e2e suite must cover the social path, not only the email one.
- [ ] The sign-up form keeps its links to `/terms` and `/privacy` and gains **no** checkbox.
