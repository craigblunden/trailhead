# Upgrade requests: asking to be moved up a Plan, and being told about it

**Status:** implemented

Settled in a grilling session on 2026-09-22. The glossary gains **Upgrade request** (`CONTEXT.md`).
**ADR-0009** records why a pending request is derived from the Tenant's Plan rather than stored as a
status.

## Problem Statement

A Tenant on `free` who wants `basic` has no way to say so. `PlanComparison` shows the Plans side by
side under "Plans — coming soon" and is, by its own doc comment, "static… nothing here is a control".
The only path onto a Plan is the owner running `npm run db:plan -- <email> basic` (ADR-0001), and the
owner has no way of learning that anyone wants it.

The product has no payments and is not getting them in this phase. So this is not a checkout: it is a
way for a Tenant to raise their hand, and a way for the owner to hear about it.

## Solution

A button in `Your plan` (and in the plans grid, where the Practice round's upsell lands) that emails
the owner the asker's details and the command line to run. The request is kept as a row so the button
can stay disabled while it is outstanding, and the Plan itself stays exactly as unreachable from the
application as ADR-0001 made it.

## Decisions

### The Tenant may write a request; the Tenant may not write a Plan

ADR-0001 is not weakened. `UserPlan` keeps its grants — the application role still has `select` and
nothing else. The new `UpgradeRequest` table is ordinary tenant data under the same forced RLS as
every other table: a row that *asks* for a Plan is not a Plan, and nothing reads a request when
deciding a Limit.

### Pending is derived, never stored

A request counts as pending while the Plan it names is above the Tenant's current Plan **and** it was
made less than 14 days ago. There is no `status` column, no `resolvedAt`, and no `UPDATE` or `DELETE`
grant for the application role. The migrator — the operator's own role — has a policy of its own, as it
does on `UserPlan`, because forced RLS would otherwise stop the operator reading the very table they
are emailed about. **ADR-0009.**

The consequence, which is the point: the one act the owner already performs — `npm run db:plan` —
resolves the request, with no second chore and no admin screen. And a request the owner never actions
lapses at 14 days rather than disabling the button for good, so ignoring a request is a soft no that
expires instead of a dead end.

### The request names the next Plan up, and the client never says which

`PLANS` is ordered, so `free` asks for `basic` and `basic` asks for `pro`. A Tenant on `pro` is shown
no button. The action takes **no arguments**: the server reads the Tenant's Plan inside the tenant
transaction and derives the target itself, so an empty request body cannot lie about which Plan it
wants. The disabled button is decoration; the data layer refuses independently.

### The email is sent before the row is written

They cannot be atomic. Sending first means a failed send leaves no row, and the Tenant sees an error
and can try again. The other order fails silently — the button disabled, the owner never told — which
is the one outcome worth engineering against. The cost is a possible duplicate email, which is cheap.

The email carries what the owner needs to act without opening anything: who, their email, their user
id, the Plan they are on, the Plan they asked for, how many times they have asked, and the literal
command line to paste.

### Trailhead sends no mail to its users

Not when a request is granted, not when one lapses. Every mail path in this application points at the
owner; the only mail a user receives is Supabase Auth's own. A "your request expired" notice would be
a rejection the owner did not write, and a grant confirmation would need a verified sender, an
unsubscribe story and a deliverability problem, for a product with one operator. A Tenant learns their
Plan changed by looking at the page.

## Out of Scope

- **Payment, pricing, checkout.** Still no payment path in this product. The button asks; it does not buy.
- **An admin screen.** The table is read with `psql` or the Supabase dashboard, and `npm run db:plan`
  already lists everyone off the default Plan.
- **Declining a request explicitly.** The 14-day lapse is the decline. A `db:plan --clear-requests`
  flag would be a fine addition later; nothing depends on it.
- **Downgrades.** Nobody has asked to go down, and "Cancellation" is reserved vocabulary (`CONTEXT.md`).
- **Requesting a Plan two rungs up.** `free` asks for `basic`. If that is wrong, it is wrong cheaply.
