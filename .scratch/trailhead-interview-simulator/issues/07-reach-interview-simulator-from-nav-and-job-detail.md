# 07: Reach the Interview Simulator from navigation and from a Job's detail page

**What to build:** "Interview Simulator" appears in the primary navigation; its hub page lets a
Tenant search for and pick a Job to rehearse for; a Job's detail page links straight into that
Job's Attempt, skipping the picker.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] "Interview Simulator" appears in the primary navigation for every Plan.
- [ ] The hub page's Job picker searches by role or company, reusing the Contact-link
      search-and-filter pattern — a search input plus a capped, scrollable, ungrouped result list —
      rather than the board's grouped, multi-column view.
- [ ] Selecting a Job from the picker leads to that Job's Attempt start screen.
- [ ] A Job's detail page has an entry point that routes straight to that Job's Attempt, skipping
      the picker entirely.
- [ ] The Job-picker component is tested with `fetch` mocked, covering search filtering and
      selection.
