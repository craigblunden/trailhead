# 02: The privacy page names both providers and what each commits to

**What to build:** The substantive page. What leaves this product, where it goes, and what each
provider promises — quoted, not paraphrased.

See `spec.md` → What the pages actually say. Pairs with `.scratch/trailhead-footing/` issue 06, which is
the developer-facing half; the two must not disagree.

**Blocked by:** 01

**Status:** ready-for-review

- [ ] A section per provider. **Anthropic**: cover letters, interview question sets, Attempt scoring.
      **TypeSafe**: the Footing. For each — what text is sent, what is not, the no-training commitment
      quoted verbatim, and the retention position.
- [ ] Say plainly that the **uploaded files are never sent** to either provider: both take extracted
      text only. Files live in the private `documents` bucket.
- [ ] State both no-training commitments as the commitments they are. **No disclaimer** saying the
      operator cannot determine whether data trains AI models — that is less accurate than the truth.
- [ ] Anthropic retention is stated as **30 days**, the standard commercial API period. Confirm it
      against Settings → Privacy Controls → Data retention period before the page goes live: it is a
      fact about this project's configuration rather than a permanent truth, which is why the page is
      dated. Never replace it with a vague phrase if it cannot be confirmed — say it is being confirmed,
      with the date.
- [ ] TypeSafe's retention is stated as what it is: kept while needed to provide the service, deleted on
      request, with no period published. Specific about what is unknown, rather than vague about
      everything.
- [ ] The page carries a "last updated" date, and a line noting retention can differ by model.
- [ ] Also state what the product does **not** do: no sale of data, no advertising, no sharing between
      Tenants (there is no row a second user may read), and App feedback is emailed and stored nowhere.
