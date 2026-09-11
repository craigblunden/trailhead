import type { Page } from "@playwright/test";

import { SIGNED_OUT, createJob, expect, test } from "./fixtures";
import { BREAKPOINTS, PRIVATE_ROUTES, PUBLIC_ROUTES } from "./routes";

/** Fails if the document scrolls sideways, naming the widest offenders. */
async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);

  const { scrollWidth, clientWidth, culprits } = await page.evaluate(() => {
    const doc = document.documentElement;
    const culprits: string[] = [];

    if (doc.scrollWidth > doc.clientWidth) {
      for (const el of document.querySelectorAll("body *")) {
        // SVG children legitimately extend past the view box, which the
        // <svg> itself clips — only flag real layout boxes.
        if (el.closest("svg")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > doc.clientWidth + 1) {
          culprits.push(
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(rect.right)}px`,
          );
        }
      }
    }

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      culprits: culprits.slice(0, 5),
    };
  });

  expect(scrollWidth, `overflowing elements:\n${culprits.join("\n")}`).toBeLessThanOrEqual(
    clientWidth,
  );
}

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  for (const route of PUBLIC_ROUTES) {
    for (const width of BREAKPOINTS) {
      test(`RESP-1: ${route.name} does not overflow horizontally at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route.path);
        await expectNoHorizontalOverflow(page, width);
      });
    }
  }

  test("LAND-3: the header Sign in control appears only past the sm breakpoint", async ({ page }) => {
    await page.goto("/");
    const headerSignIn = page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Sign in" });

    await page.setViewportSize({ width: 320, height: 900 });
    await expect(headerSignIn).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(headerSignIn).toBeVisible();
  });
});

test.describe("signed in", () => {
  for (const route of PRIVATE_ROUTES) {
    for (const width of BREAKPOINTS) {
      test(`RESP-1: ${route.name} does not overflow horizontally at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route.path);
        await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();
        await expectNoHorizontalOverflow(page, width);
      });
    }
  }

  for (const width of BREAKPOINTS) {
    test(`RESP-1: a job detail page does not overflow horizontally at ${width}px`, async ({ page }) => {
      await createJob(page);
      await expectNoHorizontalOverflow(page, width);
    });
  }

  test("RESP-2: board columns stack on a narrow screen and spread out on a wide one", async ({
    page,
  }) => {
    await createJob(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/board");
    const columns = page.getByRole("region");
    // The list streams in after the shell; measure once the columns exist.
    await expect(columns.first()).toBeVisible();

    const narrow = await columns.evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left)),
    );
    expect(new Set(narrow).size, "stacked columns share one left edge").toBe(1);

    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await columns.evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left)),
    );
    expect(new Set(wide).size, "five columns sit side by side").toBe(5);
  });
});
