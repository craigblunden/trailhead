# 01: The job page as a summit attempt

**Status:** ready-for-review

**Blocked by:** None

## What to build

The board, contacts, and documents pages carry the cartoon mountaineering scene; a Job's page ran on a
plain background. Give it the same feel by telling the Job's Stage as a summit attempt, without losing
anything the page does:

- **Interested:** studying a map in front of the mountain
- **Applied:** setting up base camp
- **Interviewing:** climbing
- **Offer:** a rocky summit above the clouds
- **Rejected:** a learning opportunity, preparing for the next attempt

## Acceptance criteria

- [x] Each Stage has its own illustrated scene, in the landscape's palette and with the board's hiker
- [x] Changing Stage changes the scene (a crossfade, none under reduced motion) and rolls back with a refused change
- [x] Every control the page had keeps working: Stage, edit details, the posting link, description, notes, and every card
- [x] The Stage is always said in words beside the picture; the scenes are hidden from assistive technology
- [x] The scenes are rendered on the server, not shipped in the page's JavaScript
- [x] The loading outline lays out through the same frame, so nothing moves when the page arrives
- [ ] The job page's responsive, axe, and loading-state e2e checks pass (not run: no local stack at the time)

## Comments

### 2026-09-14 — agent: prototype, verdict, and implementation

**The prototype.** Branch `prototype/summit-attempt` (tip `0261c59`) holds everything that was looked at:
`src/components/prototype/summit/` with the scenes and the variants, switchable on the real
`/board/[id]` with `?variant=A|A2|B|C` in dev, and `tests/prototype/`, which renders every variant at
every Stage against the in-memory fakes and photographs it with the app's compiled CSS at 390, 768,
1440, and 1920 px.

- **A, summit banner:** a scene above the page as it was.
- **B, altitude rail:** a sticky mountain profile whose camps are the Stage control, with the cards given expedition names.
- **C, expedition strip:** five scene panels as the Stage control, with the cards that matter at this Stage first.

**Verdict: A, revised through A2.** The user picked A, then asked for these changes:

1. The title and actions sat under a cropped banner and took too much room. The title moved onto the scene's sky, and the whole picture now shows beneath it. The progress steps moved to a strip under the picture.
2. A large frosted panel sits behind the title and company, with the type bigger on desktop.
3. The scenes were drawn wider, with sky and meadow running on either side, so a short banner shows more landscape instead of cropping the sky. That let the header come down by about a fifth.
4. Added during implementation: the summit hiker holds up a signed contract, like the one on the board's Offer marker.
5. Also added during implementation: the Stage select, Edit details, and Open posting moved into the same strip as the progress steps, to make the header smaller still.

B and C were not taken.

**Implementation.**
- **Scenes:** `SummitScenes` draws all five scenes, each hidden until its Stage is shown. The Job's page route renders them on the server and passes them to `JobDetail`, the same way the board's trail scene reaches the board.
- **Header:** `SummitHeaderFrame` lays out the sky, the title panel, and the strip. The page and its loading outline both use it.
- **Words:** the Stage's step name, phase, and line, plus each scene's sky colour, live in `src/lib/summit.ts`.
- **Semantics:** the page's `<main>` now starts at the header, so the `h1` is inside it. `PageMain` takes `as="div"` for the frame beneath.
- **Tests:** SUM-1 to SUM-4 in `job-detail.test.tsx` cover four things:
  - the phase follows the Stage
  - a rejected Job is off the route
  - the scene matches the Stage and rolls back on a refusal
  - the scenes handed in are never redrawn

**Checked by eye:** the header at 320, 390, 768, 1440, and 1920 px for every Stage, with no horizontal overflow at any of them. A production build shows none of the scene drawings in `.next/static`.

**Tradeoffs:**
- **768 px:** between `sm` and `lg` the title sits above the picture rather than over it. Otherwise it covers the summit hiker, the Map scene's flag, and the Rejected scene's route. That width is taller than in A2 as a result.
- **Dark theme:** there is no dark version of the scenes. The app has no dark theme switched on today.
