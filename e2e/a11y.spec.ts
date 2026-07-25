import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ROUTES } from "./routes";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function analyse(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
}

/** Renders violations as something readable in the failure output. */
function describeViolations(violations: Awaited<ReturnType<typeof analyse>>["violations"]) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("\n  ")}`,
    )
    .join("\n\n");
}

for (const route of ROUTES) {
  test(`A11Y-1: ${route.name} has no axe violations`, async ({ page }) => {
    await page.goto(route.path);
    await page.evaluate(() => document.fonts.ready);

    const { violations } = await analyse(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
}

test("A11Y-1: the board with the add-job dialog open has no axe violations", async ({
  page,
}) => {
  await page.goto("/board");
  await page.getByRole("button", { name: /add job/i }).click();
  await expect(page.getByRole("dialog", { name: "Add a job" })).toBeVisible();

  const { violations } = await analyse(page);
  expect(violations, describeViolations(violations)).toEqual([]);
});

test("A11Y-3: small text clears 4.5:1 against the gradient washes", async ({ page }) => {
  // axe abstains on gradient backdrops, so assert the tokens directly. These
  // are the two colours that carry nearly all the small text in the product.
  await page.goto("/");

  const contrast = await page.evaluate(() => {
    const luminance = (hex: string) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    return {
      eyebrowOnSky: ratio(token("--eyebrow"), token("--sky")),
      mutedOnCard: ratio(token("--muted-foreground"), token("--card")),
      mutedOnMeadow: ratio(token("--muted-foreground"), token("--meadow")),
    };
  });

  expect(contrast.eyebrowOnSky).toBeGreaterThanOrEqual(4.5);
  expect(contrast.mutedOnCard).toBeGreaterThanOrEqual(4.5);
  expect(contrast.mutedOnMeadow).toBeGreaterThanOrEqual(4.5);
});
