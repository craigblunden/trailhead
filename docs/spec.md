# Spec: Trailhead — job application tracker UI

**Status:** active · **Phase:** UI-only (no backend) · **Last updated:** 2026-07-25

> This spec was written *after* the first UI pass, so it codifies behaviour that already
> exists. From here on it is the contract: change the spec first, then the code. Every
> requirement below carries an ID so tests can cite it.

---

## Objective

Trailhead is a job-application tracker. A job seeker running several applications at once
loses track of which resume went where, what the posting link was, and who they spoke to.
Trailhead puts every role on one board, from first spark to signed offer.

**User:** an individual job seeker with 5–30 concurrent applications. Not a recruiter, not
a team — there is no sharing, no multi-user, no permissions model.

**This phase ships the interface only.** There is no backend, database, or authentication.
Board state lives in React context seeded from fixtures; auth forms navigate without
verifying anything. Success for this phase is a UI that a stakeholder can click through
end to end and that a backend can be dropped behind without reworking components.

### User stories

- **US-1** As a job seeker, I see every application grouped by stage so I know where each
  one stands.
- **US-2** As a job seeker, I add a role I found — with the posting link, salary band, and
  the resume I sent — so I stop losing that context.
- **US-3** As a job seeker, I open one role and see its description, my notes, the people
  involved, and what has happened so far.
- **US-4** As a job seeker, I move a role to a new stage and the board reflects it.

### Explicitly out of scope this phase

Drag-and-drop between columns · cover-letter generation · adding/editing contacts ·
real resume upload (the dropzone records a filename only) · form validation beyond native
HTML constraints · persistence across reload · dark mode as a shipped feature (tokens
exist, nothing toggles them).

---

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19.2 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS v4, CSS custom properties for all design tokens |
| Components | shadcn/ui on Radix (`radix-ui` v1.6) |
| Icons | lucide-react |
| Fonts | Source Serif 4 (display), Karla (body), via `next/font/google` |
| Unit / component tests | Vitest + React Testing Library + jsdom + vitest-axe |
| End-to-end tests | Playwright (Chromium) + @axe-core/playwright |

---

## Commands

```
Install:      npm install
Dev:          npm run dev
Build:        npm run build
Start:        npm run start
Lint:         npm run lint
Typecheck:    npx tsc --noEmit

Unit tests:   npm test                  # vitest run
Watch:        npm run test:watch
Coverage:     npm run test:coverage
E2E:          npm run test:e2e          # playwright test (boots its own server on :3100)
E2E UI:       npm run test:e2e:ui
All checks:   npm run verify            # lint + typecheck + unit + e2e
```

---

## Project Structure

```
src/app/                    Routes. (auth) is a layout-only group for the signed-out shell.
  layout.tsx                Fonts, metadata, html/body shell.
  globals.css               ALL design tokens. Single source of truth for colour/radius.
  page.tsx                  Landing.
  (auth)/                   Shared centred shell + scene.
  board/layout.tsx          Mounts JobsProvider.
  board/page.tsx            Kanban.
  board/[id]/page.tsx       Detail.

src/components/ui/          shadcn primitives. Edit deliberately; they are ours now.
src/components/board/       Kanban column, job card, add-job dialog, board view.
src/components/job/         Detail cards: details, contacts, activity, cover letter.
src/components/             Shared shell: headers, logo, user menu, trail scene, chips.
src/lib/jobs.ts             Types, stage metadata, seed fixtures, formatting helpers.

tests/                      Vitest unit + component tests, mirroring src/ layout.
  setup.ts                  jsdom polyfills (Radix needs several), jest-dom, axe matchers.
e2e/                        Playwright specs.
docs/spec.md                This file.
```

---

## Code Style

Tokens over literals, composition over configuration, and comments that explain *why*:

```tsx
export function JobCard({ job }: { job: Job }) {
  return (
    <li className="relative rounded-md bg-card p-3 ring-1 ring-foreground/10 ...">
      <h3 className="font-sans text-sm leading-snug font-bold">
        {/* Stretched link: the whole card opens the job, while the posting
            link below stays independently clickable. */}
        <Link href={`/board/${job.id}`} className="... after:absolute after:inset-0">
          {job.role}
        </Link>
      </h3>
      <MetaChip>{formatSalary(job)}</MetaChip>
    </li>
  );
}
```

Conventions:

- **CS-1** Files are `kebab-case.tsx`; components are `PascalCase`; helpers are `camelCase`.
- **CS-2** Named exports only — no default exports outside `src/app/` route files.
- **CS-3** Colour, radius, and illustration values come from CSS custom properties in
  `globals.css`. No hex literals in components. The one sanctioned exception is
  `ACCENTS` in `jobs.ts`, which is per-company data, not theme.
- **CS-4** Spacing uses the Tailwind scale. No arbitrary pixel values except where a
  single value is genuinely off-scale and commented (e.g. the `left-[3.5px]` timeline rail).
- **CS-5** Components stay under ~200 lines; split when they grow past it.
- **CS-6** `"use client"` only where interactivity actually requires it.
- **CS-7** Comments explain *why*, never restate *what*.

---

## Functional requirements

### Data and formatting — `src/lib/jobs.ts`

| ID | Requirement |
| --- | --- |
| DATA-1 | `STAGES` is exactly `interested, applied, interviewing, offer, rejected`, in that order. Board column order follows it. |
| DATA-2 | `ACTIVE_STAGES` is every stage except `rejected`. |
| DATA-3 | `formatSalary` returns `"Salary TBD"` when both bounds are null. |
| DATA-4 | `formatSalary` returns `"Up to $Nk"` when only the minimum is null, `"From $Nk"` when only the maximum is null. |
| DATA-5 | `formatSalary` returns `"$Nk–$Mk"` (en dash, U+2013) when both bounds are present. |
| DATA-6 | `formatShortDate("2026-07-22")` is `"Jul 22"`; `formatLongDate("2026-06-30")` is `"June 30, 2026"`. Both format in UTC so server and client render identically. |
| DATA-7 | `timelineLabel` returns `"Applied <short>"` when `appliedOn` is set, otherwise `"Added <short>"`. |
| DATA-8 | `initials` returns the first character of the company name, uppercased. |
| DATA-9 | `pluralize` agrees with its count — "1 application", "0 applications". Counts read to screen readers go through it. |
| DATA-10 | `webLink` returns the URL only for `http:`/`https:`. Everything else — `javascript:`, `data:`, blanks, unparseable text — returns `null`, and callers render no link. `<input type="url">` accepts `javascript:`, so browser validation is not a boundary. |

### Landing — `/`

| ID | Requirement |
| --- | --- |
| LAND-1 | Renders exactly one `<h1>`: "Every application, one trail." |
| LAND-2 | Primary CTA links to `/signup`; secondary CTA links to `/login`. |
| LAND-3 | The header "Sign in" control is hidden below the `sm` breakpoint (the hero repeats it), so the header never overflows a 320px viewport. |

### Auth — `/signup`, `/login`

| ID | Requirement |
| --- | --- |
| AUTH-1 | `/signup` renders name, email, and password fields, each with an associated accessible label. `/login` renders email and password only. |
| AUTH-2 | Password input requires `minLength=8`; on signup it is described by a visible "At least 8 characters." hint. |
| AUTH-3 | Submitting either form navigates to `/board`. No credentials are checked — this is a prototype seam. |
| AUTH-4 | Each form links to the other mode (`/login` ⇄ `/signup`). |

### Board — `/board`

| ID | Requirement |
| --- | --- |
| BOARD-1 | Renders one column per stage, in `STAGES` order, each labelled with the stage name and the number of jobs in it. |
| BOARD-2 | The count line reads "N active applications", where N counts jobs whose stage is in `ACTIVE_STAGES`. Singular "application" when N is 1. |
| BOARD-3 | Each job appears in exactly one column — the one matching its stage. |
| BOARD-4 | A column with no jobs shows "Nothing at this stage yet." instead of an empty list. |
| BOARD-5 | When the board has no jobs at all, an empty state with an "Add job" CTA replaces the columns. |
| BOARD-6 | Stage colour is never the sole signal — every dot is accompanied by the stage name in text. |

### Job card

| ID | Requirement |
| --- | --- |
| CARD-1 | Shows role, company, location chip, and salary chip (via `formatSalary`). |
| CARD-2 | The role title links to `/board/{id}`, and its stretched pseudo-element makes the whole card clickable. |
| CARD-3 | The "Posting" link points at `job.postingUrl`, opens in a new tab, and carries `rel="noopener noreferrer"`. It must remain independently clickable — i.e. it is *not* nested inside the card's anchor. |
| CARD-4 | Shows `timelineLabel(job)`. |
| CARD-5 | A job whose posting URL is missing or not an ordinary web link (per `webLink`) renders no posting link at all. An empty `href` would silently reload the board. |

### Add-job dialog

| ID | Requirement |
| --- | --- |
| ADD-1 | "Add job" opens a modal dialog titled "Add a job"; focus moves into the dialog. |
| ADD-2 | Company and role title are required; the browser blocks submission when either is empty. |
| ADD-3 | Submitting adds the job to the **Interested** column with today's date and a single activity entry, "Added to board — Interested". |
| ADD-4 | A blank location stores `"Location TBD"`. Blank or non-numeric salary bounds store `null`, so the card falls back to "Salary TBD". |
| ADD-5 | Choosing a resume file records its filename and swaps the dropzone for a removable chip. |
| ADD-6 | Cancel and the close button both dismiss the dialog without adding anything, and reset any staged resume. |

### Job detail — `/board/[id]`

| ID | Requirement |
| --- | --- |
| DET-1 | Shows role as the `<h1>`, plus company and location, salary bounds, applied/added date, and resume filename. |
| DET-2 | An unknown id renders "This job isn't on your trail" with a link back to `/board`, rather than crashing or 500ing. |
| DET-3 | Changing the stage select updates the job's stage and prepends a "Moved to `<Stage>`" entry, dated today, to its activity. |
| DET-4 | Moving a job off `interested` when it has no `appliedOn` backfills today's date. Moving *to* `interested` never sets one. |
| DET-5 | Re-selecting the stage the job is already in is a no-op — no duplicate activity entry. |
| DET-6 | Editing description or notes updates the shared store, so the board and detail view stay in sync. |
| DET-7 | Contacts render name, title, and a `mailto:` link. With no contacts, an explanatory empty state appears. The add-contact control is disabled until there is somewhere to persist a contact — never enabled-and-inert. |
| DET-8 | Activity renders newest-first in the order stored, each with a formatted short date. |
| DET-9 | The cover-letter action is present but disabled and labelled "coming soon". |
| DET-10 | With a usable posting URL, "Open posting" is a new-tab link. Without one, it is a genuinely disabled `<button>` reading "No posting link" — `disabled` on an anchor does nothing. |
| DET-11 | The Details, Contacts, and Activity panels are labelled regions with real `<h2>` headings, matching the left column's panels. |

### Accessibility — WCAG 2.1 AA

| ID | Requirement |
| --- | --- |
| A11Y-1 | Landing, signup, board, board-with-dialog-open, and detail each produce zero axe violations at wcag2a/wcag2aa/wcag21a/wcag21aa. |
| A11Y-2 | Every interactive control is reachable and operable by keyboard. Opening the dialog moves focus inside it; closing returns focus to the control that opened it (WCAG 2.4.3). |
| A11Y-3 | Body and small text meet 4.5:1 contrast. `--eyebrow` is deliberately darker than the source mock, which failed at 12px. |
| A11Y-4 | Decorative graphics — the trail scene, stage dots, and company initial tiles — are hidden from assistive tech, and the information they carry is available as text. |
| A11Y-5 | Every form control has a programmatically associated label, including the visually hidden ones on the paired salary inputs. |

### Responsive

| ID | Requirement |
| --- | --- |
| RESP-1 | No horizontal page overflow at 320, 768, 1024, or 1440px on any route. |
| RESP-2 | Board columns stack at narrow widths and reach five across at `xl`. |

---

## Testing Strategy

**Framework:** Vitest (jsdom) for units and components; Playwright (Chromium) for
end-to-end. Tests live in `tests/` and `e2e/`, mirroring `src/`.

**What is tested at which level:**

| Level | Covers | Why here |
| --- | --- | --- |
| Unit (`tests/lib/`) | DATA-1…8 | Pure functions. Fast, exhaustive, includes edge cases. |
| Component (`tests/components/`) | LAND, AUTH, BOARD, CARD, ADD, DET, A11Y-1/4/5 | Behaviour and wiring, driven through the DOM with `user-event`, never through internals. |
| E2E (`e2e/`) | A11Y-1/2, RESP-1/2, plus one full add-job journey | Layout, real focus order, and axe against real computed styles — none of which jsdom can judge. |

**Rules:**

- **T-1** Tests assert observable behaviour through accessible queries (`getByRole`,
  `getByLabelText`). No snapshot tests of markup, no testing of implementation details.
- **T-2** Every test names the requirement ID it covers.
- **T-3** Dates are frozen with `vi.setSystemTime` wherever "today" is involved, so
  DET-3/ADD-3 don't rot.
- **T-4** Coverage target: 90% statements on `src/lib/`, and every requirement ID above
  has at least one test. Raw coverage percentage is not a goal for components — requirement
  coverage is.
- **T-5** A bug fix starts with a failing test that reproduces it.

---

## Boundaries

**Always**

- Run `npm run verify` before committing.
- Add or update the spec requirement before changing behaviour.
- Keep design values in `globals.css`; add a token rather than a literal.
- Keep `JobsProvider` the only owner of job state.

**Ask first**

- Adding a runtime dependency.
- Changing the stage model (`STAGES`) — it is load-bearing for the board, the select, and
  the activity log.
- Editing files in `src/components/ui/` beyond token-level styling.
- Introducing persistence or a backend, which changes the provider contract.

**Never**

- Commit secrets, or wire a real credential check into the prototype auth forms.
- Delete or skip a failing test to make the suite green.
- Use colour as the only carrier of meaning.
- Add horizontal page overflow at any tested breakpoint.

---

## Success Criteria

This phase is done when all of the following hold:

1. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass clean.
2. `npm test` passes, with at least one test citing each requirement ID in this spec.
3. `npm run test:e2e` passes: zero axe violations on all four screens, zero horizontal
   overflow at 320/768/1024/1440, and the add-job journey completes.
4. A stakeholder can click landing → signup → board → add a job → open it → change its
   stage, without a dead end.
5. Swapping `JobsProvider`'s body for real data requires no changes to any consumer.

---

## Open Questions

- **OQ-1** Persistence: is `localStorage` wanted as an interim step, or does the next phase
  go straight to a real backend? This decides whether the reload-loses-state behaviour is a
  bug or the expected shape for now.
- **OQ-2** Is drag-and-drop between columns expected before the backend, or after?
- **OQ-3** Dark-mode tokens exist but nothing toggles them. Ship a toggle, or delete the
  `.dark` block to avoid maintaining an untested theme?
- **OQ-4** The seed fixtures ship in the app bundle. Keep them as a demo mode, or move them
  behind a flag once real data exists?
