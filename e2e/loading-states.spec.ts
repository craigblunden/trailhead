import type { Page } from "@playwright/test";

import { expectAccessible } from "./checks";
import { createJob, expect, test } from "./fixtures";

/**
 * Performance ticket 02: moving between signed-in pages shows a loading state at once, instead of
 * nothing until the server has checked the session and read the data.
 *
 * To see the loading state reliably, each navigation's server render is held back for a few
 * seconds. Prefetches are not held: the loading state they carry is what makes it instant.
 */

const HOLD_MS = 8_000;

async function holdNavigations(page: Page) {
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] === "1" && !headers["next-router-prefetch"]) {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    }
    await route.fallback();
  });
}

const loading = (page: Page) => page.getByRole("status").filter({ hasText: /^Loading…$/ });

test.describe("performance ticket 02: loading states", () => {
  test("from the board to Documents: an announced, accessible loading state, then the page", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByRole("heading", { level: 1, name: "Your trail" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await holdNavigations(page);

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Documents" }).click();

    await expect(loading(page)).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole("banner")).toBeVisible();
    await expectAccessible(page);
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible({ timeout: HOLD_MS + 10_000 });
  });

  test("from the board to a Job's page", async ({ page }) => {
    const job = await createJob(page);
    await page.goto("/board");
    await page.waitForLoadState("networkidle");
    await holdNavigations(page);

    await page.getByRole("link", { name: job.role, exact: true }).click();

    await expect(loading(page)).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole("heading", { level: 1, name: job.role })).toBeVisible({ timeout: HOLD_MS + 10_000 });
  });

  test("between Contacts: the list stays, and only the detail side waits", async ({ page }) => {
    const name = `Loading Lee ${Math.random().toString(36).slice(2, 6)}`;
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add contact" }).first().click();
    await page.getByRole("dialog", { name: "Add a contact" }).getByLabel("Name").fill(name);
    await page.getByRole("dialog", { name: "Add a contact" }).getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.goto("/contacts");
    await page.waitForLoadState("networkidle");
    await holdNavigations(page);
    const list = page.getByRole("link", { name: new RegExp(name) });

    await list.click();

    await expect(loading(page)).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: HOLD_MS + 10_000 });

    // Leave the worker's account as it was.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: "Delete contact" }).click();
    await page.getByRole("dialog", { name: `Delete ${name}?` }).getByRole("button", { name: "Delete contact" }).click();
    await expect(page).toHaveURL(/\/contacts$/);
  });
});
