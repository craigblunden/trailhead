# 04: The end of a Practice round

**What to build:** When a Practice round ends — every question answered, or time up — the Tenant sees
their own answers read back, with scoring shown as the Pro feature it is, and can practise again.

See `spec.md` → A Practice round ("After it ends").

**Blocked by:** 03 (take a Practice round)

**Status:** ready-for-agent

- [ ] Titled "That's the practice round" when every question was answered, "Time's up" when the
      countdown ran out.
- [ ] Each question in order, with its Category and the Tenant's answer as text; an unreached question
      says "Not reached".
- [ ] Where a Scorecard would be, a panel says scoring — stars, what landed, what was missed, what to
      change next time — comes with Pro, and links to the Plan comparison on the Account page. No
      scores, placeholders, or blurred Scorecard.
- [ ] **Practise again** starts a fresh round (preferring new questions); a line points to the full
      Simulator on Pro.
- [ ] No score request is ever made for a Practice round, and nothing accepts one.
- [ ] End-to-end: finish a round by answering all four, and separately by letting the clock run out
      mid-answer; both read back correctly, and Practise again starts a new one.
