import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { BREAKPOINTS } from "./routes";

/**
 * The bar every surface is held to (tickets 13, 20), defined once: zero axe violations at the four
 * WCAG rule sets, no horizontal scroll at any of the four widths, and controls reachable by Tab.
 * jsdom cannot judge layout or computed colour, which is why these live in e2e.
 */

export const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export async function expectNoAxeViolations(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // axe reads computed colour, so a dialog still fading in reads as low contrast. Let every finite
  // animation finish first; an endless one (a spinner) is not waited on.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const described = violations.map(
    (v) =>
      `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join("\n  ")}`,
  );
  expect(violations, described.join("\n\n")).toEqual([]);
}

/** Fails if the document scrolls sideways at `width`, naming the widest offenders. */
export async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);

  const { scrollWidth, clientWidth, culprits } = await page.evaluate(() => {
    const doc = document.documentElement;
    const culprits: string[] = [];

    if (doc.scrollWidth > doc.clientWidth) {
      for (const el of document.querySelectorAll("body *")) {
        // SVG children legitimately extend past the view box, which the <svg> itself clips — only
        // flag real layout boxes.
        if (el.closest("svg")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > doc.clientWidth + 1) {
          culprits.push(
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(rect.right)}px`,
          );
        }
      }
    }

    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, culprits: culprits.slice(0, 5) };
  });

  expect(scrollWidth, `overflow at ${width}px:\n${culprits.join("\n")}`).toBeLessThanOrEqual(clientWidth);
}

/** No horizontal scroll at any breakpoint, leaving the viewport at a desktop width afterwards. */
export async function expectNoOverflowAtAnyWidth(page: Page) {
  for (const width of BREAKPOINTS) await expectNoHorizontalOverflow(page, width);
  await page.setViewportSize({ width: 1280, height: 900 });
}

/** Both checks on the page as it stands — an open dialog included. */
export async function expectAccessible(page: Page) {
  await expectNoAxeViolations(page);
  await expectNoOverflowAtAnyWidth(page);
}

/**
 * Presses Tab until `target` has focus, failing if it takes more than `limit` presses. Proves a
 * control is reachable in the page's own order, not merely clickable.
 */
export async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let presses = 0; presses < limit; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab did not reach ${target} within ${limit} presses`);
}
