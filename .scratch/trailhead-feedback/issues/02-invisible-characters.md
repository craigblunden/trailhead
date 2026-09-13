# 02: Invisible characters — strip everywhere, detect in Feedback

**Status:** done

## What to build

A pure module shared by both sides of the boundary (like the quota maths), with two functions and
no dependencies:

- **Strip**: remove zero-width characters (ZWSP, ZWNJ, ZWJ, word joiner, BOM), Unicode format
  characters (general category `Cf`) other than the tag block below, and bidi controls (LRM, RLM,
  LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI). An emoji sequence held together by ZWJ becomes its
  parts; that is acceptable in a cover letter. Returns the cleaned string.
- **Detect tags**: true when the string contains any character in `U+E0000`–`U+E007F`, the Unicode
  tag block used to hide text from human readers. Typed text never contains them.

**Where strip applies**: every input at prompt assembly (company, role, description, resume text, the
Draft, and Feedback). It never refuses, never logs, never flags.

**Where detect applies**: Feedback only, in the generation module before any reservation (issue 04
wires it). Not to the posting or resume, which are stripped and left to the writer's verdict.

**Feedback validation**: a zod schema for the route's optional body: `feedback` a string, trimmed,
stripped, then at most 500 characters. The 500 is a named constant the card reads too. Validation
runs in the Route Handler like an action's, before the data layer.

## Acceptance criteria

- [ ] Pure tests: each stripped class is gone and everything else is untouched; a tag character is
      detected, a plain string is not; a string of only invisible characters strips to empty
- [ ] The prompt-assembly test proves every fenced input arrives stripped
- [ ] Feedback over 500 characters after stripping is refused by validation, before any session or
      quota work; exactly 500 is accepted
- [ ] No lint, typecheck, or boundary-test complaints (the module is pure and lives with the other
      shared, pure modules)

## Comments

Done 2026-09-13. `src/lib/invisible.ts`: `stripInvisible` removes every `Cf` character and bidi control
except the tag block, which `hasTagCharacters` detects. Strip runs inside the prompt's `fence()`, so every
input arrives clean, and on the letter that comes back too (so the plain text the user pastes into their
own template carries nothing they cannot see — the card's copy says so). `coverLetterRequestSchema` in
`src/server/validation.ts` strips, trims, then bounds Feedback at `FEEDBACK_MAX_CHARS` (500), which the
card's textarea reads as its `maxLength`.
