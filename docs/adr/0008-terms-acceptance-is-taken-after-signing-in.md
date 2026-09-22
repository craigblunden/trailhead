---
status: accepted
---

# Terms acceptance is taken after signing in, not on the sign-up form

Disclosing what this product sends to which AI provider needs somewhere to say it and a record that it
was agreed to. The obvious place for the record is a checkbox on the sign-up form. We are not putting
it there.

## Why

An Account can arrive through a social sign-in. `src/server/auth/session.ts` reads every linked
identity from `app_metadata.providers`, and `google` is among them — so a person can hold an Account,
upload a resume, and have a cover letter written for them without `components/auth/auth-form.tsx` ever
rendering.

A checkbox on that form would therefore cover some users and not others, which is worse than covering
none: the feature looks finished, the gap is invisible, and the accounts it misses are exactly the ones
nobody thinks about again. A gate sited **after authentication** covers every provider with one
mechanism, and — because it keys off "this session has no acceptance of the current version" rather
than off a moment in the sign-up flow — it is simultaneously the backfill for every Account that
predates the terms existing. There is no separate migration step to write, and no second code path
that only runs once.

This also fixes the ordering problem the form has. On the form, acceptance happens before the Account
exists, so there is no `userId` to hang the record on until the sign-up succeeds; after sign-in there
always is one.

## Considered options

- **A checkbox on the sign-up form.** Rejected: it silently misses social sign-ins, and it has nothing
  to write the record against until the Account exists.
- **Implicit acceptance — "by signing up you agree", with a link.** Rejected: the entire point is
  surfacing what is sent to AI providers, and an implicit link surfaces nothing and records nothing.
- **A blocking step after authentication.** Chosen.

## Consequences

- A `TermsAcceptance` table — `userId`, `version`, `acceptedAt` — append-only, one row per version
  accepted, under the tenant policy like every other table. **Not** Supabase `user_metadata`, which is
  writable by the user it belongs to and so cannot hold a record about that same user.
- `TERMS_VERSION` is one constant in `src/lib/terms.ts`, owning the number the way `PLAN_LIMITS` owns
  its numbers. Bumping it re-prompts everyone, and the history says who accepted what and when.
- The gate sits on the `(app)` layout's path, so every authenticated route is behind it rather than
  each one remembering to check.
- Acceptance is **erased with the Tenant**. `CONTEXT.md` says Account deletion is "at once and for
  good", and there is nothing left to evidence consent for once the Account is gone — so a
  `supabase/migrations/…_erase_terms_acceptance.sql` extends `erase_my_account` (ADR-0004), as
  `erase_attempts` and `erase_practice_rounds` did.
- The sign-up form still links to `/terms` and `/privacy`, for people who want to read before starting.
  It just is not where the record is made.
- A Tenant who declines has nowhere to go but sign out. That is the honest consequence of a gate, and
  it is preferred to a half-usable app whose disclosure is optional.
