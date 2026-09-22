# 03: The acceptance record

**What to build:** `TermsAcceptance`, `TERMS_VERSION`, and the erasure migration.

See `spec.md` → What is recorded. **ADR-0008**; **ADR-0004** for why erasure is a migration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `src/lib/terms.ts` exports `TERMS_VERSION` — one constant, owning the number the way
      `PLAN_LIMITS` owns its numbers, with a comment saying that bumping it re-prompts every Account.
- [ ] `TermsAcceptance`: `userId`, `version`, `acceptedAt`, primary key `[userId, version]`. Under the
      tenant policy like every other table, with its own `userId` column rather than reaching through a
      parent.
- [ ] **Append-only.** A new version is a new row; nothing updates or deletes an acceptance. The history
      says who accepted what and when.
- [ ] Not Supabase `user_metadata` — the subject can write their own, so it cannot hold a record about
      that subject. Note this in the model's doc comment so nobody "simplifies" it later.
- [ ] `supabase/migrations/…_erase_terms_acceptance.sql` extends `erase_my_account`, following
      `erase_attempts` and `erase_practice_rounds`. A test proves a deleted Account leaves no rows.
- [ ] `hasAcceptedCurrentTerms(userId)` in `src/server/data/`, reading through the tenant policy.
