# 13: Where contacts, documents, and generation live in the UI

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

## What to build

A throwaway prototype against the real components that settles the information architecture for
everything in tickets 14 through 19. The standing constraint is that all of this fits inside the
existing UI, with tweaks where they improve the experience. That is a thing to look at, not a thing to
describe — build it rough, react to it, and write down what it decided.

Nothing here ships. The output is a decision recorded in this ticket, which tickets 14, 15, 17, and 18
then implement properly.

Three surfaces, in descending order of how much is genuinely unsettled.

### Contacts, promoted to user-owned

The largest piece of visual work, and the only genuinely new information architecture. Today
`contacts-card.tsx` is a job-scoped sidebar card with a disabled "Add" button. A Contact is now owned
by the user, carries a kind and an optional agency, and links to many jobs.

- Does the job detail page keep a card that links out, and is there a standalone contacts route?
- **How does "which roles has Dana sent me?" get answered visually?** That is the question the whole
  promotion exists to serve, and the prototype is a failure if it does not answer it.
- Where does adding and editing a Contact happen — inline on the job, or on the contact?
- Which fields are required and which are optional, and is "last spoken" something the user sets or
  something derived from activity? Settle it here; ticket 14 builds it.

### Documents

Today `resume-field.tsx` records a filename and treats the resume as a property of one job. Both
change: a Document is user-owned and reused across jobs.

- **The per-job dropzone metaphor may now be wrong.** Picking an existing document is the common case;
  uploading a new one is the exception. What does the picker look like?
- A cap of three documents that the UI has to express gracefully **before** the user hits it, not
  after.
- Where does delete live?

### The cover-letter card

`cover-letter-card.tsx` ships a disabled "Generate — coming soon" button. It becomes real: pick a
resume, generate from it plus the job description, read the letter, copy it.

The letter is **not stored** — no versioning, no Document, no history. Generation takes roughly 10 to
25 seconds behind a pending state, so **the waiting state is a real design problem, not a spinner
afterthought.** So is what the user sees when they have used up their quota.

## Constraints

Design tokens live in `src/app/globals.css`; text colours are tuned to WCAG AA, and the e2e suite
asserts contrast, horizontal overflow, and focus order at 320, 768, 1024, and 1440px. Anything new
inherits that bar.

No chart is needed. The portfolio dashboard left the phase.

## Acceptance criteria

- [ ] A throwaway prototype exists and has been looked at, not merely written
- [ ] The contacts information architecture is decided and recorded here, including how a contact's
      jobs are surfaced and where editing happens
- [ ] The Contact field list is settled: which fields, which required, which validated, and how "last
      spoken" is set
- [ ] The document picker versus uploader question is decided, and the cap is expressed before it is
      reached
- [ ] The generation waiting state and the at-quota state are both designed, not deferred
- [ ] Whether the board itself surfaces anything new is answered either way
- [ ] The prototype is deleted or clearly marked as throwaway; nothing from it ships as-is
