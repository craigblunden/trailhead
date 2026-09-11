# 04: The cover-letter generation module owns the quota

**Status:** ready-for-agent

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

- [ ] The Route Handler holds no quota logic: the session check, the id, one call, and status mapping.
- [ ] The module's tests run against the real database, with a Claude client pointed at a local fake of the Messages API. There are no module mocks.
- [ ] Every quota rule proven today still holds, tested through the module's interface:
  - five letters a week, even under concurrent requests
  - a fresh week on Monday, UTC
  - a refusal, error, timeout, or truncated letter is refunded
  - a crash after reserving is refunded, and says so
  - a Job with no resume or no description is refused before any quota is taken
  - another Tenant's Job is refused without taking quota
- [ ] If giving a letter back fails, the outcome says it was not refunded.
- [ ] The route's own test covers only status mapping and the unauthenticated and not-found replies.
- [ ] The cover-letter e2e journey passes unchanged.
