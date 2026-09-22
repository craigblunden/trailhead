# 06: Past interviews on the hub

**What to build:** The Interview Simulator's hub shows the Tenant's past Attempts below the Job picker,
newest first, and each scored one opens its own Scorecard at a link they can return to. An Attempt
still in progress appears too, offering Resume.

See `spec.md` → History and variety.

**Blocked by:** 01 (the Interview Simulator's loading boundary the new page's wait relies on), 02 (stars
on each row)

**Status:** ready-for-review

- [ ] A tenant-scoped read lists the Tenant's scored Attempts across all Jobs plus any in-progress
      Attempt, newest first, leaving out reset and never-scored ones; each row carries the Job's
      company and role, the date started, the length, and the overall score. Tested for tenant
      isolation like every other read.
- [ ] The hub shows the list below the picker: Job, date, length, overall stars. An in-progress row
      offers Resume and goes to that Job's page; a scored row goes to that Attempt's Scorecard.
- [ ] With no past Attempts the section is absent or says so plainly — no empty frame.
- [ ] `/interview/<job>/<attempt>` shows that Attempt's Scorecard, view-only, with the Job named and a
      way back to the hub and to rehearsing that Job again. Another Tenant's Attempt, an unknown one,
      an unscored one, or one that belongs to a different Job is a not-found.
- [ ] That page has its own branch in the loading outline and the header's hiker wait, and arrives with
      the shared crossfade.
- [ ] `/interview/<job>` is unchanged: still the latest Attempt for Resume or Go.
- [ ] The locked preview for `free` and `basic` shows no history (they have none to show).
- [ ] End-to-end: finish and score an Attempt, see it on the hub, open it, and read the same Scorecard.
