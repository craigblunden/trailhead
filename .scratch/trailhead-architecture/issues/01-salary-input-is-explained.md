# 01: A salary the server refuses is explained

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

## What to build

On a Job's page, typing a salary expectation like `1.5` or `-3` sends it to the server. The server refuses it as a field error ("Enter a whole number of thousands"). The page then shows only "Check the highlighted fields.", and nothing on the page is highlighted.

Two things cause this:

- **The failure line reads the wrong message.** The job store shows the action's generic message. The Application kit and the Contacts card show the field's own message first. So the same refusal reads differently depending on which card made the change.
- **Salary and location are parsed three ways.** The add-job dialog, the Details card, and server validation each parse them their own way. What a form accepts drifts from what the server refuses. The add-job dialog also keeps its own copy of the "Location TBD" fallback.

After this ticket:

- The forms parse salary and a blank location with the same preprocessing validation uses. Validation is pure and already importable from both sides.
- Every failure line on the job page shows the field's message when there is one.

## Acceptance criteria

- [ ] Typing `1.5` into a salary on a Job's page shows the server's own words ("Enter a whole number of thousands"), not the generic line.
- [ ] The job store, the Application kit, and the Contacts card describe a failure the same way: the field message, then the rule's message, then the fallback.
- [ ] The add-job dialog and the Details card read a salary and a blank location exactly as validation does. One set of parsing rules exists, tested once.
- [ ] A component test refuses a salary edit with a real field-level action error (not a plain `Error`) and asserts the message shown.
- [ ] The existing rollback tests still pass.
