---
status: accepted
---

# A Job keeps its last Draft, so a Rewrite starts from text the server wrote

Ticket 18 decided that a generated letter is never stored. Feedback-driven Rewrites (`CONTEXT.md`)
need the letter being changed, and we chose to keep the last **Draft** per Job server-side rather
than have the browser send the previous letter back. A letter the client supplies is unverifiable
text from the same user — a second injection surface, and one that lets any text pose as our own
output — while a fresh write with Feedback appended cannot honour "keep paragraph two". One Draft
per Job, replaced by every write, deleted with the Job, and never a Document.

## Considered options

- **The browser returns the previous letter with the Feedback.** No schema change, but the
  Rewrite's most important input becomes untrusted, and the "material, not instructions" fence
  around it means nothing when the user wrote both.
- **A Rewrite is a fresh write with Feedback appended.** Keeps "nothing stored", but Feedback can
  only ask for a different letter, never for changes to this one.

## Consequences

- The job page shows the Draft on return; the "this letter isn't saved" line goes.
- Only the newest Draft is kept. Versioning a Draft, or keeping every letter, stays deferred.
- The Draft is tenant data under the same row-level security as the Job it belongs to.
