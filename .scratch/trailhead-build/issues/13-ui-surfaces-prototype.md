# 13: Where contacts, documents, and generation live in the UI

**Status:** ready-for-review

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

## Comments

### 2026-09-11 — agent: prototype built and looked at; decision proposed, then confirmed

**The prototype.** Three variants, each a coherent answer across all three surfaces, switchable with
`?variant=A|B|C` and a floating bar (← / → keys, plus a "State" panel for documents on file, letters
left, and generation speed). Everything lives in `src/components/prototype/` with a `PROTOTYPE —
ticket 13` header, and state is in-memory fakes linked to the account's real jobs, so nothing is
written. Hosts: the real `/board/[id]` and `/board` (dev only, only with `?variant=`), plus throwaway
`/contacts` and `/documents` routes that 404 in production.

- **A — cards & dialogs.** The page as it is, made real. The sidebar Contacts card gains "Also on N
  other jobs →"; add is a search-first dialog; edit is a dialog. The document is a `<select>` in
  Details. The letter card has a stepped checklist while waiting. `/contacts` is an expandable list.
- **B — contact pages & slots.** A People card of links; linking is a combobox; editing happens only
  on the contact. `/contacts` is master-detail with "Roles with Dana" grouped by stage. Documents are
  three always-drawn slots. The letter is a full-width desk: inputs on the left, paper on the right,
  and an elapsed-vs-usual time band while waiting.
- **C — board as the hub.** People as a byline under the job title, managed in a side sheet. The board
  gets a person filter ("Roles with Dana Whitfield" on the real columns). The document is a radio list
  in an "Application kit" card. Generation doesn't block: a status toast carries the wait.

Looked at through a Playwright tour at 1440 and 320px: idle, pending, done, at the document cap, at
quota, and every dialog. After fixes, every page has 0px horizontal overflow at 320 and 1440px. One
trap worth carrying into ticket 14: a CSS grid with no base column template sizes its phone-width
track to the widest `whitespace-nowrap` line ("Recruiter · Northstar Talent · 4 roles"), widening
every card on the page. Give such grids `grid-cols-1` (`minmax(0,1fr)`).

**What looking at it showed** (the things that were not visible on paper):

1. **`Job.documentId` is one column, and it bites.** C made it visible: attach an uploaded cover
   letter and the resume is detached, so generation has nothing to write from. Ticket 17 says a cover
   letter "can be uploaded and attached too". That needs a second reference (`coverLetterId`) or the
   rule that only resumes are attached — **a decision for review**, and a migration if the former.
2. **A stepped "Reading your resume → Writing" checklist is a lie.** Generation is one opaque request
   (streaming is deferred); the steps are timers dressed as progress. So is **Cancel**: the request
   keeps running server-side and the quota is already spent.
3. **B's time band is the honest waiting state**: elapsed seconds against the 10–25 s range, no
   invented percentage, announced once through `role="status"` rather than every tick.
4. **Slots make the cap unmissable but put Delete on the attach path.** B's slots cost a full-width
   section on every job page, and the destructive action sits beside the common one.
5. **The board filter answers "which roles has Dana sent me?" best in context, but does not scale.**
   The chip row already scrolls sideways at 320px with four people, and a 30-job search has 15+.
6. **LinkedIn is not a column.** The map lists it among "details on hand"; the schema does not have it.
7. **A full nine-field form inside a job-page dialog is heavy.** Search-first linking (A's dialog, B's
   combobox) is what prevents duplicate Contacts, which is the whole point of the promotion.

**Proposed decision** — not final until reviewed:

- **Contacts IA.** The job page keeps a sidebar card (A's rows: name, kind · agency, email, "Also on N
  other jobs →"). Linking is search-first, with "Create “name”" at the bottom. Creating from a job asks
  only name and kind, then links. Full editing happens on the contact. `/contacts` is a real route:
  master-detail on wide screens, list → `/contacts/[id]` on narrow, with "Roles with <name>" grouped
  by stage (B). That grouping is the visual answer to "which roles has Dana sent me?".
- **Contact fields.** Required: name (≤120) and kind (select, defaulting to Recruiter). Optional:
  title (≤120), agency (≤120, hint "only if they work for a firm other than the company hiring"),
  email (format-validated, ≤254), phone (≤40, digits, spaces, `+ ( ) . -`), notes (≤2,000), LinkedIn
  (http(s) only, ≤2,048, sanitised like `postingUrl` — **needs a column; for review**). **Last spoken is
  set by the user**, never in the future, with a one-click "Spoke today". It is not derived: activity
  entries are job-scoped, as the schema comment already records.
- **Documents.** A picker, not a dropzone: C's radio list ("Send with this job": Nothing, then each
  document with kind and "on N jobs"). Upload is a secondary row beneath it, landing attached. The cap
  shows wherever upload is offered: "room for 1 more" before the limit; at the limit, the upload
  control is replaced by "All 3 slots used · Manage documents", so a fourth upload cannot be
  attempted. **Delete lives only on `/documents`**, in a list that shows which jobs use each document,
  behind a confirm naming those jobs.
- **Cover letter.** The existing card made real (A's layout), with B's honest waiting state inside it:
  elapsed vs. 10–25 s, a skeleton, and "you can keep editing this page". No fake steps, no Cancel.
  Keep B's short-description warning ("Short descriptions make generic letters"). Letters left are
  always visible on the card ("3 of 5 left this week"). **At quota**, Generate is disabled and the card
  explains why and when, in B's copy ("each one is written fresh by a paid AI model; your next 5
  arrive Monday"). A letter already on screen stays copyable. The limit, window, and first-use
  wording stay ticket 18's.
- **The board.** Nothing new this phase. C's filter was the most direct answer, but it does not
  survive a realistic contact count; `/contacts/[id]` carries the question instead.
- **Header navigation.** B's Board / Contacts / Documents links (md and up, user menu unchanged) made
  the new routes findable. **For review**; today they are reachable only from the user menu.

### 2026-09-11 — agent: verdict

**The user reviewed and confirmed the proposed decision as written, with all four open points
resolved in favour of the recommendation:**

1. **Layout** — as proposed above. Board unchanged; slots and the board filter rejected.
2. **Cover letters get their own reference.** Ticket 17 adds a nullable `coverLetterId`, so a job
   holds a resume and a cover letter at once.
3. **LinkedIn earns a column.** Ticket 14 adds `linkedinUrl` in its migration.
4. **The header gains Board / Contacts / Documents links** at md width and up.

Tickets 14 and 17 now carry these decisions and matching acceptance criteria. Tickets 15, 16, and 18
already defer to this ticket: the cap wording, delete-with-confirm on `/documents`, and the honest
waiting and at-quota states are all recorded above.

**The prototype is captured, not merged.** Branch `prototype/13-ui-surfaces` holds all three variants,
the switcher, the throwaway `/contacts` and `/documents` routes, the `?variant=` hooks on the board
pages, and `screenshot-tour.spec.ts`, which reproduces what was looked at. None of it is on `main`,
and nothing from it ships as-is: tickets 14, 15, 17, and 18 rebuild from the decision, with tests.
