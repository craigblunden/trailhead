# 07: Declare each operation once, for both sides of the seam

**Status:** ready-for-agent

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

- [ ] A new Job's input, a Job patch, and a Contact's fields are each defined once, derived from the schemas.
- [ ] No per-entity actions client that only unwraps remains. Jobs, Contacts, Documents, and the cover letter's status share one mapping.
- [ ] Document upload keeps its signed-URL steps and its Storage refusal messages.
- [ ] A malformed id gets the same invalid result from every action, from one definition.
- [ ] The action result type no longer comes from one entity's actions module.
- [ ] The action error tests, the boundaries test, and every component and e2e test pass.
