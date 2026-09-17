# 08: Ask how the Simulator is going

**What to build:** The moment a Tenant's second Attempt is scored, below the whole Scorecard, a small
card asks how the Interview Simulator is working for them. Its button opens the existing App feedback
form, and what they send is marked as being about the Interview Simulator so the owner's email says so.
It appears that once and never again.

This is **App feedback** (to the people who make Trailhead), not **Feedback** (about a letter) — see
`CONTEXT.md` and `spec.md` → Waits and asking.

**Blocked by:** 05 (the card sits below the final Scorecard layout)

**Status:** ready-for-agent

- [ ] Scoring an Attempt reports whether it is the Tenant's second scored Attempt across all Jobs;
      re-scoring or reopening an Attempt never reports it again. Nothing new is stored to remember the
      ask.
- [ ] Only the Scorecard shown right after that scoring renders the card, below everything else on it —
      not the history page for the same Attempt, and not after a reload.
- [ ] The card's copy is short (e.g. "Two interviews in — how's the simulator working for you?") and
      carries no stars of its own; its button opens the App feedback form.
- [ ] App feedback accepts an optional context naming where it was asked from; the email's subject or
      body says "Interview Simulator" when given. Sending from the header button is unchanged.
- [ ] Sending or closing the form leaves the card dismissed for the rest of the visit.
- [ ] Tests: the second-scored-Attempt rule (first, second, third, and a re-score), the App feedback
      context reaching the email, and the component showing the card only when told to.
