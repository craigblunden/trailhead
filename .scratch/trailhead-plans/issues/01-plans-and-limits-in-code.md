# 01: Plans and Limits in code

**Status:** ready-for-review

## What to build

One pure module, `src/lib/plans.ts`, that says what each Plan's Limits are. Nothing else in the
codebase states a Limit number after this.

```ts
export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

/** A Limit is a count, or no limit at all. */
export type Limit = number | "unlimited";

export type Limits = { documents: Limit; lettersPerWeek: Limit };

export const PLAN_LIMITS: Record<Plan, Limits> = {
  free: { documents: 3, lettersPerWeek: 5 },
  pro: { documents: "unlimited", lettersPerWeek: 25 },
};
```

Plus the pure helpers the two sites and their copy need: `withinLimit(held, limit)`, and the
`QuotaStatus` shape gaining an unlimited case (or `limit: Limit`) so the cover-letter card can
render either.

## Decisions

- `DOCUMENT_CAP` (`src/lib/documents.ts`) and `COVER_LETTER_QUOTA` (`src/lib/generation.ts`) are
  removed, not aliased. Every reader — the two components, `roomLeft`, `quotaStatus`, the
  `cap-reached` refusal message, the seed's plan checks — takes a Limit from `PLAN_LIMITS` or from
  the Limits it is handed.
- `roomLeft` and `quotaStatus` take the Limit as an argument. They were already the only places
  that computed against the number.
- Enum members of `Plan` are asserted against the Prisma enum in `src/server/db/enum-assertions.ts`
  like `Stage` is (issue 02 adds the enum).

## Seams under test

1. `tests/lib/plans.test.ts` — `withinLimit` for numbers and unlimited; `PLAN_LIMITS.free` equals
   the numbers the app shipped with, so a change there is deliberate.
2. Existing tests of `roomLeft`, `quotaStatus`, and the refusal messages pass a Limit.
