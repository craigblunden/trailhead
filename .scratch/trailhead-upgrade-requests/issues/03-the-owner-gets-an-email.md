# 03: The owner gets an email

**What to build:** the shared Resend sender, the upgrade-request composer, and the env rename.

See `spec.md` → The email is sent before the row is written, and Trailhead sends no mail to its users.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [x] Lift the Resend POST out of `src/server/mail/app-feedback.ts` into `src/server/mail/send.ts`.
      Two callers is the point at which that is worth doing; one sender, one timeout, one place that
      knows the API shape.
- [x] `OWNER_TO_EMAIL` / `OWNER_FROM_EMAIL`, falling back to `APP_FEEDBACK_TO_EMAIL` /
      `APP_FEEDBACK_FROM_EMAIL` so no deployment breaks on the rename. Update `.env.example`.
- [x] `composeUpgradeRequestEmail()` exported for testing, like `composeAppFeedbackEmail`. Plain text
      only. Subject: `Trailhead upgrade request: basic for <name>` — stable, so repeats thread together.
- [x] The body carries name, email, user id, current Plan, requested Plan, `Asked N times since <date>`,
      and the literal `npm run db:plan -- <email> <plan>` to paste.
- [x] No mail to the user, on grant or on lapse. Say why in the module doc: every mail path here points
      at the owner.
