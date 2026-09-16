# 08: Free and Basic Tenants see a locked preview instead of the real flow

**What to build:** Tenants not on `pro` see the same start screen (length picker, Category
breakdown) rendered in a locked/blurred state with an explanation of what unlocks on `pro`, reached
identically from the nav hub and from a Job's detail page; the nav item carries a `pro`-only
indicator for them.

**Blocked by:** 05, 07.

**Status:** ready-for-agent

- [ ] A `free` or `basic` Tenant sees a `pro`-only indicator next to "Interview Simulator" in the
      primary navigation.
- [ ] Visiting the hub or a Job's Attempt entry point as `free`/`basic` renders the real start
      screen (length options, Category breakdown) in a locked/blurred state with upgrade
      messaging, rather than a separate static "coming soon" screen.
- [ ] The locked state cannot be bypassed into a working start action from the UI.
- [ ] The start Route Handler rejects a start request from a non-`pro` Tenant with a clear, distinct
      outcome.
- [ ] The locked-preview component is tested with `fetch` mocked, covering both entry points and
      confirming no start action is reachable.
