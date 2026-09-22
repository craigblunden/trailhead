# 01: The request record and the pending rule

**What to build:** `UpgradeRequest`, the pure pending rule, and the erasure migration.

See `spec.md` → Pending is derived, never stored. **ADR-0009**; **ADR-0004** for why erasure is a
migration; **ADR-0001** for why `UserPlan`'s grants are not touched.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [x] `UpgradeRequest`: `id` (cuid2), `userId`, `plan`, `requestedAt`, indexed on
      `[userId, requestedAt]`. Its own `userId` column like every other table, never reaching through
      a parent.
- [x] **Insert-only.** `GRANT SELECT, INSERT` to `trailhead_app` and deliberately no `UPDATE` or
      `DELETE`: a request is a log of an ask, not a record to be resolved. Say so in the model's doc
      comment so nobody adds a `status` column later.
- [x] Forced RLS with the `tenant_isolation` policy, exactly as `TermsAcceptance` has it, plus a
      `migrator_manages_requests` policy — forced RLS binds the owner too, so the operator's own role
      needs naming to read the table at all, exactly as `UserPlan` names it.
- [x] `GRANT SELECT, DELETE ON "UpgradeRequest" TO postgres`, and a
      `supabase/migrations/…_erase_upgrade_requests.sql` extending `erase_my_account`, following
      `erase_terms_acceptance`.
- [x] `src/lib/plans.ts` gains `nextPlanUp(plan): Plan | null` reading `PLANS` as the ladder it is,
      `UPGRADE_REQUEST_LAPSES_AFTER_DAYS = 14`, and a pure `isUpgradeRequestPending(request, plan, now)`.
      Pure, so it is tested without a database.
- [x] `UserPlan` is untouched. Nothing in the request path reads a request when deciding a Limit.
