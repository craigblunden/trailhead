# 04: The cover-letter generation module owns the quota

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

Writing a cover letter takes one from the weekly quota. It gives that one back if no letter is delivered.

The rule has several parts:

- Reserve after the inputs are checked, and before the Claude call.
- Give it back on a refusal, an API error, a timeout, a truncated letter, or a crash after reserving.
- Never give one back for a refusal that happened before reserving.
- Report "refunded" only when giving it back actually worked.

Today this rule lives in the Route Handler:

- It tracks the reservation in a variable it changes as it goes.
- It has two separate paths that give a letter back.
- It calls four data functions that must run in the right order.

All three recent review commits changed that handler. The integration tests reach it only by building a `Request` and mocking the whole Claude module, so the route's own client wiring is never exercised.

After this ticket, one server-side module takes a Job id and a Claude client, and returns an outcome. The outcome is either a letter with the quota left, or a failure code saying whether the letter was refunded and what quota is left. Reserving and refunding happen inside the module.

The Route Handler only checks the session, validates the id, and maps the outcome to a status code and JSON. Generation stays a Route Handler, not a Server Action, as ticket 18 decided. The response shape the cover-letter card reads does not change.

## Acceptance criteria

- [x] The Route Handler holds no quota logic: the session check, the id, one call, and status mapping.
- [x] The module's tests run against the real database, with a Claude client pointed at a local fake of the Messages API. Nothing is mocked but the session, as in every integration suite.
- [x] Every quota rule proven today still holds, tested through the module's interface:
  - five letters a week, even under concurrent requests
  - a fresh week on Monday, UTC
  - a refusal, error, timeout, or truncated letter is refunded
  - a crash after reserving is refunded, and says so
  - a Job with no resume or no description is refused before any quota is taken
  - another Tenant's Job is refused without taking quota
- [x] If giving a letter back fails, the outcome says it was not refunded.
- [x] The route's own test covers only status mapping and the unauthenticated and not-found replies.
- [x] The cover-letter e2e journey passes unchanged.

## Comments

### 2026-09-11 — agent

**Built: `src/server/generation/generate-cover-letter.ts`.** `generateCoverLetter(jobId, { client })` returns a `CoverLetterOutcome`:
- `{ ok: true, letter, quota }`, or
- `{ ok: false, reason, refunded, quota, unexpected? }`.

It throws only `UnauthenticatedError` and `NotFoundError`. Inside it:
- The order: session, then unavailable (no client), then inputs, the reservation, the call, and the refund.
- The reservation state.
- `BEFORE_RESERVING`, the refusals that come before a reservation.
- The give-back, which reports `refunded: false` when the refund itself fails.

**The Route Handler** checks the session, reads the id through `parseId` (ticket 07), makes one call, and maps the outcome:
- `STATUS[reason]` for a failure
- 500 when `unexpected` is set, meaning the application's own error rather than an answer from Claude
- 401 or 404 for the two errors it may throw

`src/server/data/generation.ts` keeps the quota queries and points at the module for their order.

**Response shape:** the card reads the same fields. Two small additions: the `unavailable` reply now carries `refunded: false`, and a crash before any reservation now reports the quota.

**Tests:**
- **`tests/integration/generation.test.ts`:** nothing mocked but the session. A real `Anthropic` client talks to a local fake of the Messages API.
  - The three quota tests are unchanged.
  - **GEN-1:** a letter, nothing persisted but the counter.
  - **GEN-2:** five of seven racing requests succeed, and the sixth and seventh never reach Claude.
  - **GEN-3:** Monday, UTC.
  - **GEN-4:** refusal, 529 overloaded, timeout, and truncation are all refunded.
  - **GEN-5:** a 200 with no content crashes after reserving, and is refunded as `unexpected`.
  - **GEN-6:** the session ends while Claude answers, so the refund cannot be made. The outcome says `refunded: false`, and the letter stays counted.
  - **GEN-7:** no resume, and no description, before any quota.
  - **GEN-8:** another Tenant's Job and a missing Job are the same `NotFoundError`, with no quota taken.
  - **GEN-9:** unavailable before the Job is read.
  - **GEN-10:** signed out.
- **`tests/server/cover-letter-route.test.ts`:** ROUTE-1 to ROUTE-6 cover every outcome's status and body, 500 for `unexpected`, 401 with no session, a malformed id and a missing Job as the same 404, and a session that ends during the call.
- **`docs/architecture.md`:** the cover-letter diagram shows the module.

**Verified:** typecheck, lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests, including `generation.spec.ts` and `phase-journey.spec.ts`. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
