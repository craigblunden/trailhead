# 05: The account page

**Status:** ready-for-review
**Blocked by:** 04 (for `accountSummary()`; the page can be built against a stub first)

## What to build

`src/app/(app)/account/page.tsx` — `requirePageSession()`, then prefetch `accountSummary()`, the
Tenant's Limits, and `generationQuota()` through `prefetch()`, like the Documents page. Wrapped in
`PageArrive`, with a `loading.tsx` that follows the loading vocabulary: a page-outline skeleton of
the four sections, the hiker wait in the header, a crossfade on arrival — no shimmer, no spinner.

The first three sections of the spec:

1. **Your account** — name, email, sign-in method(s). Read-only.
2. **Your Plan** — the Plan (reuse the user menu's `PlanMark` — lift it to a shared component rather
   than copying it), "N of L Documents" or "N Documents" when unlimited, and letters left this week
   with the same wording rules the cover-letter card uses.
3. **Plans — coming soon** — three columns (stacking on a phone), each Limit rendered from
   `PLAN_LIMITS`, "Unlimited" for unlimited, the current Plan marked. One line: "Paying for a Plan is
   coming soon." No prices, no buttons, no links.

The fourth section is a placeholder slot issue 06 fills.

**User menu:** an "Account" item above Sign out, below the separator that follows Documents. Not in
`PRIMARY_NAV`. Add `/account` to the protected routes in `proxy.ts` / `auth-routing.ts` if they are
listed there, and to `e2e/routes.ts`.

## Decisions

- The Plan comparison is derived, never written: a test fails if a Limit number appears as a literal
  in the component.
- Copy uses the glossary: "Plan", never "tier", "subscription", or "premium".

## Seams under test

1. Component tests: each Plan renders its Limits from `PLAN_LIMITS`; the current Plan is marked; an
   unlimited Limit reads "Unlimited"; nothing in the coming-soon section is focusable.
2. The axe and responsive e2e suites include `/account`.

## Comments

**2026-09-15 (implementation):** UI copy keeps the app's existing lowercase for common nouns ("2 of 3 documents", "Free plan", "Paying for a plan is coming soon."), as the Documents page and user menu already do; the capitalised forms in the tickets are glossary style. Letters left uses the cover-letter card's own status action; on Hold the line says letters are paused until the reset day.
