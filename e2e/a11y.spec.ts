import { expectNoAxeViolations } from "./checks";
import { SIGNED_OUT, createJob, expect, test } from "./fixtures";
import { PRIVATE_ROUTES, PUBLIC_ROUTES } from "./routes";

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  for (const route of PUBLIC_ROUTES) {
    test(`A11Y-1: ${route.name} has no axe violations`, async ({ page }) => {
      await page.goto(route.path);
      await expectNoAxeViolations(page);
    });
  }

  test("A11Y-3: small text clears 4.5:1 against the gradient washes", async ({ page }) => {
    // axe abstains on gradient backdrops, so assert the tokens directly. These
    // are the two colours that carry nearly all the small text in the product.
    await page.goto("/");

    const contrast = await page.evaluate(() => {
      const luminance = (raw: string) => {
        // The production build minifies #ffffff to #fff; read both forms.
        const hex = raw.length === 4 ? "#" + [...raw.slice(1)].map((c) => c + c).join("") : raw;
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
});

test.describe("signed in", () => {
  for (const route of PRIVATE_ROUTES) {
    test(`A11Y-1: ${route.name} has no axe violations`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }

  test("A11Y-1: a job detail page has no axe violations", async ({ page }) => {
    await createJob(page);
    await expectNoAxeViolations(page);
  });

  test("A11Y-1: the board with the add-job dialog open has no axe violations", async ({ page }) => {
    await page.goto("/board");
    await page.getByRole("button", { name: /add job/i }).first().click();
    await expect(page.getByRole("dialog", { name: "Add a job" })).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
