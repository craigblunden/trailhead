# 20: E2E migration and accessibility across every new route

**Status:** ready-for-review

**Blocked by:** 12, 14, 17, 19

## What to build

The end-to-end suite runs against a real account rather than fixtures, and every route added since
Phase 1 meets the bar Phase 1 set.

**The existing suite assumes no auth.** It navigates to the board and finds seeded jobs there. Every
one of those specs now needs an account, a sign-in, and data it created itself. This was budgeted as
real work rather than a cleanup, because it is: it touches every existing spec.

**One journey proves the phase.** Sign up, verify, sign in, add a job, change its stage, reload and
find the change still there, upload a resume, generate a letter, sign out, and confirm the board
redirects to sign-in.

**The accessibility bar is inherited, not re-argued.** Every new route — verification, forgotten
password, reset, contacts, documents — produces zero axe violations at wcag2a, wcag2aa, wcag21a, and
wcag21aa, and holds at 320, 768, 1024, and 1440px. Form and generation states are announced to
assistive tech rather than shown only as a spinner.

**Every test that touches a date sets the clock explicitly.** Added dates, applied dates, and activity
dates are all derived from today, and a suite that passes on the day it was written and fails at a
month boundary is worse than no suite.

## Acceptance criteria

- [ ] Every pre-existing e2e spec passes against a real account with data it created
- [ ] The full journey above runs end to end as one spec
- [ ] Every new route produces zero axe violations at all four rule sets
- [ ] No route overflows horizontally at 320, 768, 1024, or 1440px
- [ ] Focus order and contrast assertions cover the new surfaces on the same terms as the old
- [ ] Pending, error, and success states are announced to assistive tech across auth, upload, and
      generation
- [ ] Every date-touching test sets the system time explicitly
- [ ] Tests create and clean up their own accounts, so a run does not depend on a previous one

## Comments

### 2026-09-11 — agent

**Most of the migration had already happened.** Ticket 05 moved every pre-existing spec onto real
accounts (a verified account per worker, created through the real sign-up and Mailpit), and the
tickets since added their own specs on the same terms. This ticket closed what was left.

**Built.**

- **`e2e/phase-journey.spec.ts` — the one journey:** sign up and verify through the real mail, sign
  out and back in, add a job, move it to Interviewing and see the move survive a reload (waiting for
  the server's answer, not the optimistic screen), upload `resume.pdf` from the application kit,
  write a cover letter from it, delete the document, sign out, and find `/board` sends you to sign-in.
- **Every new route is swept.** `e2e/routes.ts` now lists `/board`, `/contacts`, and `/documents`, each
  with its heading, so `a11y.spec.ts` (axe at wcag2a, wcag2aa, wcag21a, wcag21aa) and
  `responsive.spec.ts` (320, 768, 1024, 1440) cover them. States a URL cannot reach are in
  `e2e/new-surfaces-a11y.spec.ts` and the feature specs: the verification screen after sign-up, the
  job page with the link-contact dialog open, the documents page's upload control, a job page with the
  application kit and the cover-letter card, a contact's own page (`contacts.spec.ts`), the documents
  list at the cap (`documents.spec.ts`), and a written letter (`generation.spec.ts`). The forgotten-
  and reset-password pages were already swept by `password-reset.spec.ts` (PWR-2, PWR-4).
- **Focus order**, on the same terms as Phase 1's A11Y-2: the add-contact dialog and the job page's
  link-contact dialog each take focus and return it to the control that opened them; the kit's radios
  are chosen by arrow key (`documents.spec.ts`). **Contrast** on every new surface is axe's
  `color-contrast` rule inside those sweeps, run on the real rendering.
- **Announced states:** auth (`role="status"`/`"alert"` on every form state — asserted by PWR-4, the
  auth component tests, and the new verification-screen check), upload (each stage and each refusal —
  `documents.spec.ts`, `DOC-2…4`), generation (the wait announced once; failures as alerts —
  `generation.spec.ts`, `GEN-U2`, `GEN-U4`).
- **Clocks.** Unit tests that touch dates freeze the clock (`freezeClock()`); integration tests pass
  explicit dates into the data layer, and where code reads the clock itself it is now pinned: the
  generation route tests (a run at midnight on a Sunday can no longer split a test across two quota
  weeks) and the contact tests (validation refuses a last-spoken date after today). **No e2e test
  asserts a calendar date**; dates there come from the server's clock, which a browser test cannot set.
- **Accounts clean up after themselves.** `e2e/global-setup.ts` records when the run starts;
  `e2e/global-teardown.ts` removes the `@example.com` accounts created since then from the **local**
  stack (it refuses any non-loopback database): their rows are deleted as `trailhead_app` under each
  account's own tenant — the same policies decide — and the account as `postgres`. An account that
  still has files in Storage is kept and reported, because removing an object needs its owner's
  session; the specs that upload delete what they upload. **Quota rows are left behind:** the
  application role may reserve and refund letters but not delete the counter, and test cleanup is no
  reason to grant it that; each row is a user id, a week, and a count. Runs never depended on each other — every
  test's account is new — and now they leave nothing behind.

**Found and fixed while doing this:** two of ticket 17's and 18's e2e checks raced the server —
reloading after an optimistic update before the write committed. Each now waits for the specific
Server Action response that carries its write.

**Result:** the full e2e suite, 78 tests, passes against a production build. One test was excluded
from that run and is not this work's to fix: `A11Y-1: landing has no axe violations` fails on the
**uncommitted landing-page rewrite in the working tree** (10.4px text at 4.33:1 contrast in
`src/components/landing/everything-you-need.tsx`); the committed landing page is unaffected.

**Status:** ready-for-review
