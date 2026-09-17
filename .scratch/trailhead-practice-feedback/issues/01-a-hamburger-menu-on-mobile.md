# 01: A hamburger menu on mobile

**What to build:** Below `md`, the header's avatar button becomes a hamburger button. It opens a
side sheet with every page and the account actions. At `md` and up, the avatar menu stops repeating
the primary nav's links.

See `spec.md` → 1. Mobile navigation.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] Below `md`, `AppHeader` shows a hamburger button (accessible name such as "Menu") where the avatar
      is. The Feedback button stays. The loading placeholder matches the new button's size.
- [ ] It opens a side sheet with large tap targets: name, email, Plan mark; Your trail (`/board`),
      Contacts, Documents, Interview Simulator (with the Pro mark when `canStartAttempt(plan)` is false);
      Account; Sign out (still a form submit). The current page is marked `aria-current`. Choosing a
      link closes the sheet.
- [ ] Built on the existing Radix dialog primitives (there is no sheet component yet; add one in
      `src/components/ui/` in the shadcn style if that is cleaner). Focus is trapped and restored, and
      Escape closes it.
- [ ] The page links come from `PRIMARY_NAV`, so desktop and mobile can't drift apart.
- [ ] At `md` and up, `UserMenu` shows name/email/Plan, Account, and Sign out only. Update the comment
      that says the menu carries the nav on a phone.
- [ ] Tests: update `tests/components/user-menu.test.tsx`; a component test for the mobile menu's links,
      Pro mark and sign-out; an e2e check at a phone viewport that Board → Contacts is reachable through
      the hamburger.
