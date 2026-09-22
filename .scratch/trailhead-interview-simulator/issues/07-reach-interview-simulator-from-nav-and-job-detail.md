# 07: Reach the Interview Simulator from navigation and from a Job's detail page

**What to build:** "Interview Simulator" appears in the primary navigation; its hub page lets a
Tenant search for and pick a Job to rehearse for; a Job's detail page links straight into that
Job's Attempt, skipping the picker.

**Blocked by:** 01.

**Status:** ready-for-review

- [ ] "Interview Simulator" appears in the primary navigation for every Plan.
- [ ] The hub page's Job picker searches by role or company, reusing the Contact-link
      search-and-filter pattern — a search input plus a capped, scrollable, ungrouped result list —
      rather than the board's grouped, multi-column view.
- [ ] Selecting a Job from the picker leads to that Job's Attempt start screen.
- [ ] A Job's detail page has an entry point that routes straight to that Job's Attempt, skipping
      the picker entirely.
- [ ] The Job-picker component is tested with `fetch` mocked, covering search filtering and
      selection.

## Comments

**2026-09-16: the hub and a Job's briefing become one page, "One path".** The owner found the separate
hub (a bare Job picker) and briefing (explanation beside a set-up card) awkward, and asked for a
single first page. Three layouts were prototyped on `/interview`: three columns, a single path of
steps, and list-and-detail. **The owner chose the path (variant B).**

- Question settled: what the Interview Simulator's first page should look like once picking a job
  and setting up an interview are one flow.
- Prototype, kept as a primary source and never merged: branch `prototype/interview-first-page-layouts`
  (commit `e4869ff`). Run it with `npm run dev`, then open `http://localhost:3000/interview?variant=B`.
- What carries into the real page: one column of steps that open in turn (which job, how you'll
  rehearse, Go); the picked job collapses to a row with "Change"; a job that can't be rehearsed yet
  says why ("Needs a resume", "Needs the posting") in the picker rather than only refusing at Go.

This ticket's checkboxes still hold: the picker still searches by role or company over a capped,
ungrouped list, and a Job's detail page still lands straight on that Job with the picker skipped.
