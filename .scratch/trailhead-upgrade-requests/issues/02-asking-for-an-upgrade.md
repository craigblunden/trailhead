# 02: Asking for an upgrade

**What to build:** the data function, the action, and its guards.

See `spec.md` → The request names the next Plan up, and The email is sent before the row is written.

**Blocked by:** 01, 03

**Status:** ready-for-review

- [x] `requestUpgrade()` in `src/server/data/plans.ts` — **takes no arguments**. Reads the Tenant's
      Plan inside the tenant transaction, derives the target from `nextPlanUp`, and inserts.
- [x] Refuses with a `RuleError` when the Tenant is on the top Plan, and when a request is already
      pending. The disabled button is decoration; this is the check that counts.
- [x] **Sends the email, then inserts the row.** A failed send leaves no row and throws, so the Tenant
      can try again. Comment the order and why — the opposite order fails silently.
- [x] `requestUpgradeAction()` in `src/server/actions/plans.ts` takes `unknown` and parses nothing
      from it: there is nothing the client is allowed to say.
- [x] The action invalidates nothing itself; the client refetches the account summary on both success
      and refusal, so "you already asked" shows the pending state rather than pretending the click worked.
