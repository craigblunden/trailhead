# 04: The button

**What to build:** the control, in both places it belongs, and the summary field behind it.

See `spec.md` → Solution. The Practice round's upsell links to `/account#plans`
(`src/components/interview/practice-read-back.tsx`), which lands below `Your plan`.

**Blocked by:** 01, 02

**Status:** ready-for-review

- [x] `AccountSummary` gains `upgradeRequest: { plan, requestedAt } | null`, read in the transaction
      `accountSummary` already opens. **Already filtered for lapse server-side** — the client never
      sees a request it should ignore.
- [x] One shared component, rendered in `Your plan` and again in the plans grid, where the upsell
      traffic actually lands. Same action, same guards, no state of its own.
- [x] "Ask to upgrade to Basic" → disabled "Upgrade requested — I'll be in touch". Immediate click:
      no dialog, and no free-text box — words already have a home in App feedback, and free text here
      would need the Flag machinery.
      **Not a toast.** The design said one, but this repo has no toast library and no notification
      surface; a refusal is shown inline under the button in a `role="alert"`, the way a Footing shows
      one. Success needs no message: the button becomes the answer.
- [x] Nothing at all for a Tenant on the top Plan.
- [x] `PlanComparison`'s line becomes "Paying for a plan is coming soon — until then, ask and I'll move
      you across by hand." The section is no longer static; update its doc comment, which says it is.
