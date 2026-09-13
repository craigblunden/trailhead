# 06: The landing page shows a letter written for each application

**Status:** done

## What to build

The third feature stop on the landing page still says cover letters are "on the way" and its
miniature shows "Generate — coming soon". Both are two days out of date. Make the stop say what the
product does, and make the point that each letter is specific to one application.

**Heading**: "A cover letter for this application" (or as close as the trail's heading rhythm
allows; the other two are "See where your search stands" and "Remember exactly what you sent").

**Copy** beside it, one short paragraph: written fresh for each job from its own posting and the
resume you attached to it; tell it what to change and it rewrites; nothing generic, nothing reused
between jobs. `BRAND_NAME` still names the product once. No "soon", no "on the way".

**The miniature** (`aria-hidden`, meaning carried by the copy): the live card in small. The source
line "Written from the job description and <resume file name>", a **Write cover letter** button at
full opacity, the opening lines of a letter as now, and beneath the letter a one-line Feedback box
with placeholder text ("Shorter, and lead with the marketplace redesign") and a **Rewrite** button.
Reuse the mini button and the same tokens as the other miniatures; nothing new in `globals.css`.

Nothing else on the page changes: hero, metadata, sign-in tagline, footer, the other two stops, the
scene, the trail.

## Acceptance criteria

- [ ] The landing suite: the third feature's heading and copy contain neither "soon" nor "on the
      way", name the resume and the posting, and mention feedback or rewriting
- [ ] The miniature stays hidden from assistive technology; the a11y e2e and axe pass unchanged
- [ ] Responsive e2e passes at phone width (the miniature's new row wraps, no horizontal scroll)
- [ ] README's feature line still reads true (it already says letters are written from the
      documents; add "and rewritten from your feedback" if the sentence takes it)

## Comments

Done 2026-09-13. Heading "A cover letter for this application"; copy names the posting, the attached
resume, and rewriting from feedback, with `BRAND_NAME` once; the miniature shows the live card in small
with a Feedback line and a Rewrite button, still `aria-hidden`. LAND-4 pins it. README's feature line
gains "and rewritten from your feedback".
