# 20: E2E migration and accessibility across every new route

**Status:** ready-for-agent

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
