# 05: The card shows the Draft and takes Feedback

**Status:** done
**Blocked by:** 01, 04

## What to build

The cover-letter card reads the Job's Draft, offers a Feedback box and Rewrite, confirms an empty
"Write again", and explains every new state. Copy is in the spec; use it verbatim.

**On load**: a Job with a Draft renders it in the existing letter region with Copy, and the line
under it reads "Saved with this job. Each write replaces it." No Draft → today's idle state. The
"isn't saved" line is gone everywhere.

**Under a Draft**: a labelled textarea, "What should change?", capped at the shared 500-character
constant with a count shown from 400 up; a **Rewrite** button enabled only when the box has text and
a letter can be written (available, not at quota, not on Hold, resume and description present, not
writing); and **Write again**. Write again with an empty box opens a confirmation dialog: "Write a
fresh letter? It replaces the current draft and uses one of your letters." Confirm writes fresh;
with text in the box, Write again is not offered separately (the primary action is Rewrite).

**The client** sends `{ feedback }` as JSON when there is text, no body otherwise. On a letter it
updates the job cache's Draft and Activity (the route returns the letter; the entry's label and date
are known), the way a stage change updates the cached Job, so the Activity list shows the new line
without a refetch. The status query is set from the returned quota as today.

**Notices** (same regions and roles the card already uses):

- `verdict: material` → status note under the letter.
- `setAside` → status note under the letter.
- `verdict: feedback` with `flags === 1` → alert: the first-Flag warning, naming the reset day.
- `held` from the status read or from a response → both buttons off, the Hold line naming the
  reset day; the Draft stays copyable. Replaces the at-quota line when both apply.
- `hidden-feedback` → the existing failure block with its message; the box keeps its text.
- `refused` keeps its message; since nothing is refunded the spared-letter line no longer appears
  for it (it already keys off `refunded`).

**The waiting state** is unchanged for Rewrite; the live region announces it the same way. During a
write the textarea and both buttons are disabled.

**Page skeleton**: the job page's loading outline gains the box's bar under the letter block.

## Acceptance criteria (component suite, client replaced; axe in every new state)

- [ ] A Draft on load with Copy and the saved line; none → idle
- [ ] Rewrite enabled only with text; Write again confirms when empty and writes on confirm
- [ ] The cap: 501 characters cannot be entered; the count appears from 400
- [ ] Each notice renders from its response; the first-Flag warning names the day
- [ ] Hold from the status read disables both buttons and keeps the Draft; the at-quota line yields
      to it
- [ ] A Rewrite's success updates the letter region, the saved line, and the Activity list
- [ ] The wait is announced once for a Rewrite by the pre-existing live region
- [ ] No structural axe violations in idle-with-Draft, feedback-typed, confirming, held, and each
      notice state

## Comments

Done 2026-09-13. The card shows `job.draft` (or the letter just written) with Copy and "Saved with this
job. Each write replaces it."; under it the "What should change?" box (maxLength 500, count from 400),
Rewrite (enabled only with text and when a letter can be written), and Write again — offered only while
the box is empty, with the "Write a fresh letter?" confirmation. On success the cached Job is updated
through `jobCache.record` with `withDraft`, so the Activity list gains its line without a refetch.
Notices as specified; the Hold line (from the status read or a response) replaces the at-quota line
and disables both buttons and the box. The intro copy also says what to expect, at the user's request:
the letter comes back as plain text with no formatting and nothing hidden in it, to paste into your own
cover-letter template. The job page's loading outline gains the box and buttons under the letter block.
