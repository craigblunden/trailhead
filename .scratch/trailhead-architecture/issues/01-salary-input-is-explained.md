# 01: A salary the server refuses is explained

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

On a Job's page, typing a salary expectation like `1.5` or `-3` sends it to the server. The server refuses it as a field error ("Enter a whole number of thousands"). The page then shows only "Check the highlighted fields.", and nothing on the page is highlighted.

Two things cause this:

- **The failure line reads the wrong message.** The job store shows the action's generic message. The Application kit and the Contacts card show the field's own message first. So the same refusal reads differently depending on which card made the change.
- **Salary and location are parsed three ways.** The add-job dialog, the Details card, and server validation each parse them their own way. What a form accepts drifts from what the server refuses. The add-job dialog also keeps its own copy of the "Location TBD" fallback.

After this ticket:

- The forms parse salary and a blank location with the same preprocessing validation uses. Validation is pure and already importable from both sides.
- Every failure line on the job page shows the field's message when there is one.

## Acceptance criteria

- [x] Typing `1.5` into a salary on a Job's page shows the server's own words ("Enter a whole number of thousands"), not the generic line.
- [x] The job store, the Application kit, and the Contacts card describe a failure the same way: the field message, then the rule's message, then the fallback.
- [x] The add-job dialog and the Details card read a salary and a blank location exactly as validation does. One set of parsing rules exists, tested once.
- [x] A component test refuses a salary edit with a real field-level action error (not a plain `Error`) and asserts the message shown.
- [x] The existing rollback tests still pass.

## Comments

### 2026-09-11 — agent

**Built.**

- **The parsing lives in `src/lib/job-fields.ts`** (`salaryFromText`, `locationOrFallback`, `LOCATION_FALLBACK`). Validation's `salaryBound` preprocess and the location transform call them. So do the add-job dialog and the Details card, whose own `parseSalary` and `toBound` are gone.
  - **The call:** a small zod-free module rather than importing `validation.ts` into the forms, so the job page's bundle does not gain zod.
  - A fractional or negative salary is still sent as typed, so the server refuses it with a reason rather than it being silently nulled.
- **The failure line:** the job store now describes a failure with `describeFailure`, the same as the kit and the Contacts card. Ticket 03 later moved all three onto the Job cache module, which owns that rule.

**Tests:**
- `VAL-10` (`tests/server/validation.test.ts`): for eleven inputs, what the form sends parses exactly as the text it was read from; a blank location reads as the default on both sides.
- `DET-12` (`tests/components/job-detail.test.tsx`): typing `1.5` and leaving the field sends `{ salaryMin: 1.5 }`, the client refuses with a real field-level `ActionError`, and the alert shows "Enter a whole number of thousands", not "Check the highlighted fields".
- TSQ-4, KIT-7, and KIT-9 pass unchanged.

**Verified:** typecheck, lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation on an `opacity-60` chip in "Everything you need". Those files were last changed by `a943576`, and none of these tickets touches them.
