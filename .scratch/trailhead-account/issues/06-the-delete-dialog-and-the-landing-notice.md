# 06: The delete dialog and the landing notice

**Status:** ready-for-review
**Blocked by:** 04, 05

## What to build

**The Delete account section** — last on `/account`, separated from what precedes it. One sentence
of what it does and a destructive button that opens the dialog.

**The dialog** (`ui/dialog`):

- What goes, with counts from `accountSummary()`: "12 Jobs, 3 Documents, and 8 Contacts — with their
  history, notes, and drafts." Pluralised with the existing `pluralize`.
- On `basic` or `pro`: "Your Pro plan ends with your account."
- "Want your files? Download them from Documents first." — a link to `/documents`.
- "Feedback you've already sent us isn't recalled."
- "This can't be undone."
- An email field labelled with the Account's address; the destructive button is disabled until it
  matches (trimmed, case-insensitive). The server checks again (issue 04).
- While pending: the button shows the wait, the dialog cannot be dismissed, and a second submit is
  impossible. On a refusal: the written message from issue 04 inside the dialog, the field kept.

**The landing notice** — `/` reads `deleted=1` once and shows "Your account and everything in it has
been deleted." as a dismissible, announced (`role="status"`) line, then drops the flag from the URL so
a reload does not repeat it.

## Seams under test

1. Component: button disabled until the email matches; mismatched case and surrounding spaces match;
   Plan line only on `basic` and `pro`; counts pluralise; a refusal renders and keeps the field.
2. The landing page shows the notice for `?deleted=1` and not otherwise.

## Comments

**2026-09-15 (implementation):** The landing page stays static: the notice reads `deleted=1` from the address after hydration and drops it with `history.replaceState`, rather than making `/` dynamic with `searchParams`. The dialog's wait is a `useTransition` around the action, which lasts until the redirect lands.
