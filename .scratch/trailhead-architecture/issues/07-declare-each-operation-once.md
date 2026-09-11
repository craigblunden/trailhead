# 07: Declare each operation once, for both sides of the seam

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

Each operation is written four times:

- the client interface's type
- an actions client that only unwraps the result
- a Server Action with its own hand-written id check
- the validation schema

The input types exist on both sides of the seam: a new Job's input, a Job patch, and a Contact's fields. A new editable field means editing both types and the schema. The shared browser code that reads action results also imports its result type from the jobs actions module, which is one entity's module.

After this ticket:

- Client input types are derived from the validation schemas.
- The three actions clients that only unwrap collapse into one mapping from action results to thrown action errors.
- Every Server Action rejects a malformed id the same way, from one definition.

These stay as they are:

- Server Actions are still the only write path.
- They still validate every argument and hold no query logic (enforced by the boundaries test).
- Uploads still go straight from the browser to Storage.

## Acceptance criteria

- [x] A new Job's input, a Job patch, and a Contact's fields are each defined once, derived from the schemas.
- [x] No per-entity actions client that only unwraps remains. Jobs, Contacts, Documents, and the cover letter's status share one mapping.
- [x] Document upload keeps its signed-URL steps and its Storage refusal messages.
- [x] A malformed id gets the same invalid result from every action, from one definition.
- [x] The action result type no longer comes from one entity's actions module.
- [x] The action error tests, the boundaries test, and every component and e2e test pass.

## Comments

### 2026-09-11 — agent

**Built.**

- **Input types:**
  - `NewJobInput` and `JobPatch` in `src/lib/jobs-client.ts` are the schemas' own types (`NewJobInput` and `JobPatchInput` from validation), imported as types only.
  - `ContactFields` in `src/lib/contacts-client.ts` is `NewContactInput`.
- **One mapping: `unwrapping(action)`** in `src/components/action-client.ts` turns a Server Action into a client method that resolves with the action's data, or throws its failure as an `ActionError`.
  - **Deleted:** `jobs-actions-client.ts` and `contacts-actions-client.ts`. The jobs and contacts providers declare their default clients as one `unwrapping` line per method.
  - **Uses it:** the Documents client for `list`, `remove`, `link`, and `attach`, and the cover-letter status read.
  - **Upload unchanged:** start, signed PUT, delete on failure, finish, the Storage refusal messages, and the on-demand Supabase import from performance ticket 01.
  - **Signature change:** `remove` on the Contacts and Documents client interfaces now resolves `Promise<unknown>`, because the actions return `null`.
- **One id check: `parseId(id, what)`** in `src/server/action-result.ts`. Every action that takes an id uses it, and so does the cover-letter route.
  - A malformed id gets `invalid({ id: "Unknown job" | "Unknown contact" | "Unknown document" })` and never reaches the data layer.
  - **Changed:** a malformed id in a link or unlink now names which id it was, instead of "Unknown job or contact".
  - `setJobDocumentAction` now reads the job id, the kind (the new shared `documentKindSchema`), and the document id (`null` still clears the slot) one at a time. `jobDocumentSchema` is gone.
- **The result type:** `action-client.ts` imports `ActionResult` and `ActionFailure` as types from `src/server/action-result.ts`, and the jobs actions module no longer re-exports them.

**Tests:**
- `tests/server/action-ids.test.ts`:
  - **ID-1:** each of the 15 id positions across the Job, Contact, and Document actions answers seven malformed ids with the same `invalid` result, and the data layer is never reached.
  - **ID-2:** a kit slot that is neither resume nor cover letter is refused by name.
- ERR-1 to ERR-4, the document action tests, the boundaries test, and every component test pass.

**Verified:** typecheck, whole-repository lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests, including `documents.spec.ts`. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation on an `opacity-60` chip in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
