# 01: The public pages exist

**What to build:** A `(public)` route group with `/terms` and `/privacy`, linked from the landing page
and the auth pages. Static, no session required.

See `spec.md` → What the pages actually say.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] `src/app/(public)/terms/page.tsx` and `.../privacy/page.tsx`, with the site's existing layout and
      `TrailScene`, each with its own `metadata.title`.
- [ ] `/terms` covers: no payment and no Plan is bought; no uptime or availability promise; no warranty;
      AI output can be wrong and is not career, legal or financial advice; acceptable use; Account
      deletion is immediate and irreversible. Nothing else — no liability cap, no governing law, no
      arbitration clause.
- [ ] Linked from the landing page footer, the sign-up and sign-in pages, and the account page.
- [ ] **For the owner, not the agent:** the enforceable clauses are the part worth having someone
      qualified look at, and the live question is the *resumes* rather than the AI — they carry names,
      addresses and employment history belonging to people who are not always the Tenant. Whether that
      attracts statutory obligations depends on jurisdiction and is not an agent's call.
