# Terms and privacy: saying what goes to which AI provider, and recording that it was agreed to

**Status:** implemented

Settled in a grilling session on 2026-09-22. The glossary gained **Terms acceptance** (`CONTEXT.md`).
**ADR-0008** records why acceptance is taken after signing in rather than on the sign-up form.

This effort is **split deliberately**. Issues 01–02 are the public pages, which should land before the
Footing effort ships. Issues 03–04 are the acceptance record and its gate, which the Footing effort does
not wait on.

## Problem Statement

Trailhead sends a Tenant's resume text, job descriptions and cover letters to Anthropic today — for
letters, interview question sets and Attempt scoring — on every Plan. There is no `/terms` route, no
`/privacy` route, and no record anywhere that anyone agreed to anything. The Footing effort adds a
second provider and makes this impossible to keep ignoring, but it did not create it.

There are no payments. `CONTEXT.md` is explicit that a Plan "says nothing about how the Tenant came to
be on it", and ADR-0001 means only `npm run db:plan` moves anyone, so the commercial half of a normal
terms page has nothing to describe.

## Solution

Two static public pages and one acceptance record. `/privacy` carries the substance — what is sent,
where, and what each provider commits to. `/terms` is short and true rather than long and borrowed. A
gate after sign-in takes the acceptance, because a sign-up form field would miss every social sign-in.

## Decisions

### What the pages actually say

The vendor facts are known and quotable. **Do not write a disclaimer where a commitment exists** — a
line saying the operator cannot tell whether the data trains AI models would be less accurate than the
truth and worse for the product than the truth.

- **Anthropic** — Commercial Terms: *"Anthropic may not train models on Customer Content from
  Services."* Retention is **30 days**, the standard commercial API period, configurable at Settings →
  Privacy Controls → Data retention period; zero data retention is available to qualifying commercial
  customers on request. Some models carry a 30-day floor and cannot be put under zero retention at all.
- **TypeSafe** — privacy policy: *"We will not train or fine tune any artificial intelligence or
  machine learning models on your prompts or other Input."* And: *"we will not disclose any Input to a
  third party other than our service providers."* Retention is only *"as long as reasonably necessary
  to provide you with the Services, or otherwise in support of our business or commercial purposes"*,
  with deletion on request. No number, no DPA, no sub-processor list.

So: state both no-training commitments plainly, quote them, and state the **one** thing genuinely
unknown — TypeSafe's retention window — as specifically unknown rather than fogging both vendors.

- `/privacy` says, per provider: what text is sent (extracted document text, job descriptions,
  cover-letter text), what is **not** sent (the uploaded files themselves — both providers take text
  only), what the provider commits to, and how long it is kept.
- The page is **dated**, because the Anthropic retention figure is a fact about this project's
  configuration rather than a permanent truth, and retention floors differ by model.
- `/terms`: no payment, no uptime promise, no warranty; AI output can be wrong and is not advice;
  acceptable use; and that Account deletion is immediate and irreversible, which `CONTEXT.md` already
  commits to. No liability caps or governing-law boilerplate copied from a template nobody has read.

### Where acceptance is taken

After authentication, not on the sign-up form. `src/server/auth/session.ts` reads every linked identity
from `app_metadata.providers` and `google` is among them, so a form field would cover email sign-ups
only — and look finished while missing the rest. The post-auth gate also **is** the backfill for
existing Accounts, so there is no separate one-off migration to write. **ADR-0008.**

### What is recorded

A `TermsAcceptance` row per version accepted — `userId`, `version`, `acceptedAt` — append-only, under
the tenant policy. Not Supabase `user_metadata`, which the subject can write. `TERMS_VERSION` is one
constant in `src/lib/terms.ts`; bumping it re-prompts everyone. Erased with the Tenant, which means a
migration extending `erase_my_account` (ADR-0004).

## Out of Scope

- **Anything about payment.** There is no payment path in this product.
- **A cookie banner or consent-management platform.** Nothing here sets a tracking cookie that would
  need one; if that changes, it changes in its own effort.
- **A DPA with either provider**, and chasing TypeSafe for a retention number. Worth doing, does not
  block: issue 02 states what they say today, and the page is dated so it can be tightened.
- **Legal review of the enforceable clauses.** Out of scope for an agent; flagged to the owner in
  issue 01.
