# 14: Contacts become user-owned and link to many jobs

**Status:** ready-for-review

**Blocked by:** 11, 13

## What to build

A user records the people in their search once, and sees every role each of them is connected to. The
disabled "Add" button on the job detail page becomes real.

**A Contact belongs to the user, not to a job.** A recruiter who sends four roles is one Contact
linked to four Jobs, not four copies. That relationship is the entire reason for this ticket, and the
question it has to answer visually is *"which roles has Dana sent me?"* — ticket 13 decided how.

**"Recruiter" is a kind of Contact, not a separate entity.** The kinds are recruiter, hiring manager,
referrer, and other. A recruiter who later becomes the hiring manager is one Contact whose kind
changed, never two records. **Agency is free text on the Contact**, not a record — so "the agency" is
never something the user can open. Both of these are glossary decisions in `CONTEXT.md`; if the
implementation drifts, the glossary is what is right.

The field list, the required/optional split, and where editing happens were all settled by ticket 13.
Build what it decided.

**What ticket 13 decided** (its Comments carry the reasoning):

- **The job page keeps a sidebar Contacts card.** Each row shows name, kind · agency, email, and "Also
  on N other jobs →" linking to the Contact. Linking is search-first, with "Create “name”" as the last
  option, because searching first is what prevents duplicate Contacts. Creating from a job asks only
  name and kind, then links.
- **Full editing happens on the Contact**, at `/contacts/[id]`. `/contacts` is master-detail on wide
  screens and list → detail on narrow ones. The Contact shows **"Roles with <name>" grouped by stage**:
  that is the visual answer to "which roles has Dana sent me?".
- **Fields.** Required: name (≤120) and kind (the form defaults to Recruiter). Optional: title (≤120),
  agency (≤120, hinted "only if they work for a firm other than the company hiring"), email
  (format-validated, ≤254), phone (≤40; digits, spaces, `+ ( ) . -`), notes (≤2,000), and LinkedIn
  (http(s) only, ≤2,048, sanitised like `postingUrl`). **LinkedIn is a new `linkedinUrl` column, so
  this ticket carries a migration.** Last spoken is **set by the user**, never in the future, with a
  one-click "Spoke today". It is not derived from activity.
- **The board changes nothing.**
- **The app header gains navigation links** at md width and up: Board and Contacts here, with Documents
  joining once that route exists. The user menu keeps its links and remains the route on phones.
- A trap the prototype hit: a grid with no base column template sizes its phone-width track to the
  widest `whitespace-nowrap` line and widens every card. Give such grids `grid-cols-1`.

## Acceptance criteria

- [ ] A user creates a Contact, edits it, and deletes it
- [ ] A Contact links to more than one Job, and unlinking from one Job leaves the Contact and its other
      links intact
- [ ] From a Contact, the user can see every Job it is linked to
- [ ] From a Job, the user can see and manage its Contacts, and reach the Contact itself
- [ ] Changing a Contact's kind does not create a second record
- [ ] Every field is bounded and validated per ticket 13's decision, with tests at the boundaries
- [ ] `linkedinUrl` is added by a new migration, and a link that is not http(s) is rejected
- [ ] A Contact's page groups its linked Jobs by stage
- [ ] The header links to Board and Contacts at md width and up
- [ ] A cross-user integration test proves user B cannot read, edit, delete, or link user A's Contacts
- [ ] New and changed surfaces produce zero axe violations and no horizontal overflow at 320, 768,
      1024, and 1440px

## Comments

### 2026-09-11 — agent

**Built, as ticket 13 decided.**

- **Schema:** `20260911100000_contact_linkedin_url` adds `Contact.linkedinUrl` (text, blank = none).
  The tenant policy on `Contact` covers it unchanged. `enum-assertions.ts` now also pins
  `ContactKind` to `src/lib/contacts.ts`.
- **Validation** (`src/server/validation.ts`): `newContactSchema` and a `strictObject`
  `contactPatchSchema`. Name (required, ≤120) and kind (one of four) are required; title, agency
  (≤120), email (format, ≤254), phone (≤40, digits/spaces/`+ ( ) . -`), notes (≤2,000), LinkedIn
  (http(s) only, ≤2,048, the same `webAddress` rule as `postingUrl`), last spoken (a real date, never
  after today in UTC). Every bound tested at and one past the limit.
- **Data layer** (`src/server/data/contacts.ts`): list, get, create, update, delete, link, unlink,
  and create-for-job (name + kind, contact and link in one transaction). Same rules as jobs: owner
  from the session, `withTenant`, owner in every `where`, and a foreign id is the same
  `NotFoundError` as a missing one. Linking twice is one row (`skipDuplicates`).
- **Actions** (`src/server/actions/contacts.ts`) share one translator, now
  `src/server/action-result.ts` (moved out of `actions/jobs.ts`, which kept its exports). It also
  gained a `rejected` result for domain rules (`RuleError`), which tickets 15 and 18 use.
- **Job DTO:** a Job's contacts now carry `kind`, `agency`, and `otherJobCount` (from `_count`).
- **UI:** the job page's Contacts card has real rows (name → contact, kind · agency, mailto,
  "Also on N other jobs →", remove). "Add" opens a search-first dialog: matches by name, agency, or
  title; "Create “name”" last, hidden when that exact name exists; creating asks name and kind
  (defaulting to Recruiter). `/contacts` is master-detail at `lg` and list → detail below it (the
  list lives in `contacts/layout.tsx`; `useSelectedLayoutSegment` decides which half shows). The
  Contact's page leads with **"Roles with <name>" grouped by stage**, then the full editor with
  inline field errors from the server, one-click "Spoke today", and delete behind a confirm that
  counts the jobs it touches. The header gained a Primary nav (Board, Contacts) at `md` and up.
- **Routes** moved into an `(app)` group so board, contacts, and (soon) documents share one layout
  with the session and query providers; the job store stays in `board/layout.tsx`. URLs are
  unchanged.

**Found while testing:** a failed link left its message on the card *behind* the open modal, which
Radix hides from assistive tech. The dialog now shows the failure itself (CON-J6).

**Tests:** `tests/server/contact-validation.test.ts` (10), mapper updates, `tests/integration/
contacts.test.ts` (8, including user B cannot read, edit, delete, or link A's contacts through the
data layer or the actions), `tests/components/contacts.test.tsx` (19, including axe on the card,
dialog, list, and contact page), and `e2e/contacts.spec.ts` (4: the full create → link to a second
job → edit kind → unlink → delete journey; the md nav; an unknown id; zero axe violations and no
overflow at 320/768/1024/1440 on `/contacts`, a contact, and a job page). Integration tests share
`tests/integration/session-mock.ts` from here on.

**Status:** ready-for-review
