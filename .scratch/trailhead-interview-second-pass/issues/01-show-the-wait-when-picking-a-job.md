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

**Status:** ready-for-agent

- [ ] The cause is confirmed (e.g. by reproducing on the dev server) and recorded in a comment on this
      ticket before the fix.
- [ ] Clicking a ready Job in the picker shows the Interview Simulator outline and the header's hiker
      within the same frame as the click.
- [ ] Following a Job's own "Interview" link from its detail page shows the same wait.
- [ ] Moving from a Job's page back to the hub shows the hub's outline ("Loading the Interview
      Simulator…").
- [ ] Exactly one `role="status"` is present during the wait.
- [ ] An end-to-end test asserts the outline appears on picking a Job before the page's content does.
