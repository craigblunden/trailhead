# 07: End to end with the fake Messages API

**Status:** done
**Blocked by:** 03, 04, 05, 06

## What to build

Two journeys in the generation e2e spec, driven through the browser against the fake, spending
nothing. The fake's new markers (issue 03) are read from the Feedback fence: `[[flag]]`,
`[[material]]`, `[[aside]]`.

**Journey one, the Draft**: on the mid-search account's Harvest job, write a letter; read it; reload
the page and see the same Draft with the saved line; type Feedback and Rewrite; the letter changes
and the Activity list gains "Cover letter written" then "Cover letter rewritten"; the letters-left
count fell by two. Then, with the box empty, Write again: the confirmation appears, cancel leaves
the Draft, confirm replaces it.

**Journey two, the Hold**: two Rewrites whose Feedback carries `[[flag]]`. After the first, the
warning names Monday; after the second, the card says letters are paused until Monday, both buttons
are off, the Draft is still copyable. In the same session the board still opens, a stage still
changes, and a note still saves. The at-quota case from ticket 19 still passes beside it.

**The notices**: one Rewrite with `[[material]]` shows the posting notice and takes no Flag (a
following `[[flag]]` Rewrite still only warns); one with `[[aside]]` shows the set-aside line.

**Refusal**: the existing refusal case now expects the letters-left count to fall by one and no
"didn't use one of your letters" line.

## Acceptance criteria

- [ ] Both journeys and the notice cases pass in the Playwright suite against the fake, on the local
      stack, with the environment exported as the memory note says
- [ ] The existing generation, journey, and a11y specs pass unchanged apart from the refusal
      expectation above
- [ ] CI's workflow needs no change (the fake is already started by Playwright)

## Comments

Done 2026-09-13. Three new journeys in `e2e/generation.spec.ts` (the Draft, the notices, the Hold) beside
the two existing ones; the refusal case now expects the count to fall by one and no spared-letter line,
and the at-quota loop confirms each Write again. One deviation from the ticket: the journeys run on a
fresh account created through sign-up, like every other e2e spec, rather than the seeded mid-search
account's Harvest job — the e2e stack is never seeded and the run removes the accounts it created. CI's
workflow is unchanged.
