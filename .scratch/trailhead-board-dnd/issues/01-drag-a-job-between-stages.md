# 01: Drag a Job between Stages on the board

**Status:** ready-for-review

## What to build

Today a Job changes Stage only from its detail page, through the "Application stage" select. The
board shows the five Stage columns but a card cannot be moved between them. Make the board's cards
drag-and-droppable: dragging a card onto another column moves that Job to that Stage.

The move is the existing Stage move — `setStage` on the jobs provider — so it is optimistic, is
rolled back on refusal, and prepends the same "Moved to …" Activity entry. Architecture ticket 03
anticipated this: drag-and-drop is the "fifth writer", and it must be a caller of the Job cache,
not a new policy.

Drag-and-drop is pointer-only, so every card also gets a **Move to** menu with the other four
Stages. Keyboard and screen-reader users move a Job from the board through it; touch users on
browsers without native drag use it too.

## Decisions

- **Native HTML5 drag and drop**, no new dependency. The board has five fixed drop targets and no
  within-column ordering, which is exactly what the native API handles well. A library would add
  weight to the page for reordering nobody asked for.
- The drag carries the Job id under a private MIME type. A column accepts only that type: text or
  files dragged in from outside the page are ignored.
- The card's links are marked non-draggable so a drag that starts on the role name moves the card
  rather than dragging the link's URL.
- Dropping a card on the column it came from is a no-op all the way down (the provider already
  short-circuits a move to the current Stage).
- A move made from the board is announced in a live region ("Moved Product Designer, Growth to
  Interviewing"), since the card leaves the column the user was in.

## Seams under test

1. `src/lib/board-dnd.ts` — writing and reading the Job id on a `DataTransfer`, pure.
2. `BoardView` through `renderWithJobs`, asserting on the in-memory store's `jobs.setStage` and on
   which column the card is filed under afterwards.
3. `e2e/journey.spec.ts` — one real drag in Chromium.

## Acceptance criteria

- [x] **DND-1** The drag carries the Job id under a private type; nothing else is read as a Job.
- [x] **DND-2** Dropping a card on another column moves the Job to that Stage; the card is filed under the new column and the store's `setStage` was asked for exactly that move.
- [x] **DND-3** Dropping a card on its own column asks the store for nothing.
- [x] **DND-4** A drop that carries no Job id (text, a file) is ignored.
- [x] **DND-5** A column shows it is a drop target while a Job is dragged over it, and stops when the drag leaves.
- [x] **DND-6** Each card has a "Move to" menu listing the other Stages; choosing one moves the Job the same way.
- [x] **DND-7** A move from the board is announced to assistive tech, every time it is made.
- [x] **DND-8** The card shows it is in flight from drag start to drag end.
- [x] **DND-9** A refused move rolls back and reports the non-blocking error, as the detail page's select already does (via the provider — no new path), proven from a drop on the board.
- [x] **A11Y** The board has no structural axe violations with the move menu open.
- [x] **E2E** The e2e journey performs one drag and sees the Job in the new column.

## Comments

**2026-09-12 — implemented.** Native drag and drop on `JobCard` (source) and `BoardColumn` (target),
sharing one `onMove(jobId, stage)` path with the card's new "Move to" menu; both call the provider's
`setStage`, so the Job cache's optimistic/rollback policy is untouched. Transfer helpers live in
`src/lib/board-dnd.ts`. A board-made move is announced from a polite live region rendered with the
columns. Covered by `tests/lib/board-dnd.test.ts`, the "moving a job between stages" block in
`tests/components/board.test.tsx`, an axe check with the menu open, and one real drag in
`e2e/journey.spec.ts`.

One axe note: the menu portals to `<body>`, outside every landmark, so the region rule is disabled
for that single component test. Every other rule still runs against the open menu.
