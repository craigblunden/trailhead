# 01: Show the wait when picking a Job

**What to build:** Clicking a Job in the Interview Simulator's picker shows, at once, the existing
Interview Simulator loading state — the path in outline with "Loading your interview…" and the hiker
in the header — until that Job's page arrives, then crossfades in as every other signed-in page does.
Today nothing happens between the click and the page arriving.

The likely cause, to confirm before changing anything: the signed-in loading boundary sits above the
Interview Simulator's own layout, so navigating from the hub to a Job's page stays inside a segment
that never suspends, and the outline that already has a branch for `/interview/<job>` is never shown.
Read the installed Next.js docs on loading boundaries before fixing it.

See `spec.md` → Waits and asking. Follows the loading and transition vocabulary: no spinner, no
shimmer, no slide, exactly one status region.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] The cause is confirmed (e.g. by reproducing on the dev server) and recorded in a comment on this
      ticket before the fix.
- [ ] Clicking a ready Job in the picker shows the Interview Simulator outline and the header's hiker
      within the same frame as the click.
- [ ] Following a Job's own "Interview" link from its detail page shows the same wait.
- [ ] Moving from a Job's page back to the hub shows the hub's outline ("Loading the Interview
      Simulator…").
- [ ] Exactly one `role="status"` is present during the wait.
- [ ] An end-to-end test asserts the outline appears on picking a Job before the page's content does.

## Comments

**2026-09-17, cause confirmed before the fix.** Reproduced on a production build against the local
stack: with each navigation's server render held 8 s (`e2e/loading-states.spec.ts`), clicking a Job in
the hub's picker showed no `role="status"` at all within 2 s, while a Job's own "Practice interview"
link from `/board/<id>` showed "Loading your interview…" at once.

Why: `src/app/(app)/loading.tsx` is the only loading boundary above the Interview Simulator, and it
wraps the `interview` segment from outside `interview/layout.tsx`. Per the installed Next.js docs
(`03-file-conventions/loading.md`), `loading.js` wraps the pages and nested layouts *below* its own
folder, never the layout in the same folder. Moving from `/interview` to `/interview/<job>` stays inside
the `interview` segment, whose layout persists, so nothing above it suspends and the `/interview/<job>`
branch `PageLoading` already has is never shown. From `/board/<id>` the navigation crosses from the
`board` layout to the `interview` one, so the `(app)` boundary does suspend — which is why that way in
already waited. The board has the same shape and already solves it with `board/loading.tsx`; the fix is
the same file under `interview/`.
