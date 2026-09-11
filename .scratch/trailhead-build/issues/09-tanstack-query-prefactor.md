# 09: TanStack Query replaces the provider's internals

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

The board behaves exactly as it does today, but its state now lives in TanStack Query rather than a
`useState` inside `JobsProvider`. Nothing the user can see changes. This is a prefactor: make the
change easy, then make the easy change.

Doing it against the existing fixtures — before any server exists — means the swap can be judged on
its own, and ticket 10 only has to change where the data comes from.

**The integration is first-party.** Next 16 ships a TanStack Query guide at
`node_modules/next/dist/docs/01-app/02-guides/client-side-data-fetching/tanstack-query.md`. Read it;
this shape is documented, not improvised.

Shape it settles:

- A per-request `QueryClient` on the server and a browser singleton, with the provider in the board
  layout — the shared layout, and the same seam the old `initialJobs` prop occupied.
- **`staleTime` greater than zero is mandatory**, or the client refetches immediately and throws away
  everything the server prefetched.
- The query key lives in a module both sides import, so the server's prefetch and the client's read
  cannot drift.
- Prefetch unawaited and dehydrate pending queries, so the server streams rather than blocking.

**Consumer components may change.** Phase 2 froze `JobsContextValue` to its Phase-1 shape and made
"the diff touches no consumer component" a success criterion. Both are void — that decision was
reversed deliberately, not overlooked.

**Be honest about what this buys.** The original case for TanStack Query was polling, and there is no
polling any more. What remains is genuine but smaller: refetch on window focus and on reconnect (a
tracker left open overnight currently shows stale data), and read-path retry with backoff.
Deduplication and shared job state are not gains — `JobsProvider` already does both. Do not write a
justification into the code comments that no longer holds.

**One incidental worth not rediscovering:** `refresh()` does not update today's provider at all.
`useState<Job[]>(initialJobs)` ignores a fresh prop, because a router refresh re-renders without
remounting. Nothing is broken by this today, but "refresh keeps the board fresh" is false and must not
be carried forward.

## Acceptance criteria

- [ ] Every existing board and job-detail test passes unchanged in behaviour, with the assertions
      adjusted only where the provider's own API changed
- [ ] `QueryClient` is per-request on the server and a singleton in the browser
- [ ] `staleTime` is greater than zero, and a test or a comment records why
- [ ] The query key is defined once and imported by both the prefetching server code and the client
- [ ] Optimistic update and rollback run through TanStack's mutation lifecycle, and a component test
      drives a rejecting mutation and asserts the board visibly reverts
- [ ] No `refresh()` call remains that exists to keep job state fresh

## Comments

### 2026-09-11 — agent

**Built.** The board behaves as before; its state now lives in TanStack Query, against the same
fixtures, so the swap is judged on its own. Ticket 10 only has to change where data comes from.

- `src/lib/jobs-cache.ts` — the one definition of the query key (`["jobs"]`) and `staleTime`
  (60 s, with the reason in a comment: 0 would refetch on mount and discard the streamed prefetch).
  Both the server prefetch and the client read import it.
- `src/lib/jobs-rules.ts` — the Phase-1 rules as pure functions (`nextAccent`, `stageChange`
  with the no-op / "Moved to …" / applied-date backfill rules). The optimistic update and the
  fixture client both use them, so what the user sees instantly is what the server will confirm.
- `src/lib/jobs-client.ts` — `JobsClient` (`list/add/update/setStage`) and
  `createFixtureJobsClient(seed)`. Ticket 10 supplies the server-actions client; ticket 12 moves
  the fixture client to tests.
- `src/components/providers.tsx` — `getQueryClient()`: new per server render, singleton in the
  browser. `Providers` wraps `QueryClientProvider`.
- `src/components/jobs-provider.tsx` — rewritten on `useQuery` + three `useMutation`s. Every
  mutation is optimistic through the lifecycle: `onMutate` snapshots and applies the rules,
  `onError` restores and sets a visible error, `onSuccess` replaces the optimistic row with the
  server's. Exposes `status`, `error`, `dismissError`, `reload` alongside the Phase-1 API.
  Re-selecting the current stage sends nothing. No `refresh()` anywhere.
- `src/server/prefetch.ts` — per-request `QueryClient`, prefetch **unawaited**, pending queries
  dehydrated so the server streams. `src/app/board/page.tsx` and `[id]/page.tsx` wrap their view
  in `HydrationBoundary`; the layout hosts `Providers` + `JobsProvider` and checks nothing.
- `BoardView` and `JobDetail` gained loading (`role="status"`) and failure (`role="alert"` with
  "Try again") states, and a dismissible non-blocking alert for a rolled-back mutation.
- `tests/test-utils.tsx` seeds the cache the way hydration does, so the 104 existing tests run
  unchanged in behaviour (assertions untouched; only the provider's wiring changed). New
  `tests/components/jobs-provider.test.tsx` (8): key shared, `staleTime > 0`, browser singleton,
  rejected stage change reverts visibly with a dismissible alert, rejected add removes the card,
  successful add adopts the server id, loading state, failed load with retry.

**Consumer change, deliberate:** `JobPatch` (and ticket 08's `jobPatchSchema`) includes
`salaryMin`/`salaryMax` as well as description and notes, because the Phase-1 details card
already edits the salary expectation and a dead input would lie. Stage stays a separate action.

**Status:** ready-for-review (pending the e2e run's result)
