# Trailhead

A job-application tracker UI — every role from first spark to signed offer, on one board.

This repo currently contains **the interface only**. There is no backend, database, or
auth: board state lives in React context seeded from fixtures, and the auth forms navigate
to the board without checking anything.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · lucide-react

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Testing

```bash
npm test           # Vitest: unit + component (jsdom)
npm run test:e2e   # Playwright: builds, serves on :3100, then runs
npm run verify     # lint + typecheck + unit + e2e
```

Tests are written against [docs/spec.md](docs/spec.md), and each one names the
requirement ID it covers (`DATA-5`, `ADD-3`, `A11Y-2`, …). jsdom cannot judge layout or
computed colour, so contrast, horizontal overflow, and real focus order are asserted in
`e2e/` rather than `tests/`.

## Routes

| Route         | What it is                                                        |
| ------------- | ----------------------------------------------------------------- |
| `/`           | Marketing landing page                                            |
| `/signup`     | Create account                                                    |
| `/login`      | Sign in                                                           |
| `/board`      | Kanban board across five stages, plus the "Add a job" dialog       |
| `/board/[id]` | Job detail — description, notes, salary, contacts, activity        |

## Where things live

```
src/app/                 Routes. (auth) is a layout-only group for the signed-out shell.
src/components/ui/       shadcn primitives.
src/components/board/    Kanban column, job card, add-job dialog.
src/components/job/      Detail-page cards (details, contacts, activity, cover letter).
src/components/          Shared shell: headers, logo, the illustrated trail scene.
src/lib/jobs.ts          Job/stage types, seed data, and date/salary formatting.
tests/                   Vitest unit + component tests.
e2e/                     Playwright specs.
docs/spec.md             The spec these tests are written against.
```

## Design system

All colour, radius, and illustration values are CSS custom properties in
`src/app/globals.css` — the two page washes (`scene-wash`, `board-wash`) and the SVG in
`trail-scene.tsx` read from the same tokens, so retheming happens in one file.

Text colours are tuned to clear WCAG 2.1 AA (4.5:1). Note that `--eyebrow` is deliberately
darker than the source mock, which did not meet AA at 12px.

## Swapping in a real backend

`src/components/jobs-provider.tsx` is the only place that owns job state. Replacing its
body with real fetching/mutations leaves every consumer unchanged.

## Not built yet

Drag-and-drop between columns, cover-letter generation, adding contacts, resume upload
(the dropzone records a filename only), and any form validation beyond native HTML
constraints.
