import { expect, test } from "./fixtures";

// Playwright hides scrollbars by default, and the shift this guards against is exactly one scrollbar
// wide. The option forces a worker of its own, so the test lives in its own file.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("RESP-3: opening the account menu on a page that scrolls leaves it where it is", async ({ page }) => {
  // Short enough that the board scrolls: only then does the scroll lock see a scrollbar to make up for.
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/board");
  // Measured through CSS rather than roles: an open menu hides the rest of the page from the
  // accessibility tree.
  const trigger = page.locator('[aria-label^="Account menu"]');
  const heading = page.locator("h1");
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);

  const before = [(await trigger.boundingBox())!.x, (await heading.boundingBox())!.x];
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  const after = [(await trigger.boundingBox())!.x, (await heading.boundingBox())!.x];

  expect(after, "the header and the page keep their horizontal position").toEqual(before);
});
