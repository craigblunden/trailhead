import { expectNoHorizontalOverflow } from "./checks";
import { SIGNED_OUT, createJob, expect, test } from "./fixtures";
import { BREAKPOINTS, PRIVATE_ROUTES, PUBLIC_ROUTES } from "./routes";

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
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
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

  test("RESP-4: on a phone the hamburger reaches every page, and at md the primary nav takes over (practice feedback ticket 01)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/board");
    await expect(page.getByRole("heading", { level: 1, name: "Your trail" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    await expect(page.getByRole("button", { name: /Account menu/ })).toBeHidden();

    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Contacts" }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });

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
