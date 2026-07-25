import { expect, test } from "@playwright/test";

test("US-1…4: a job seeker signs up, adds a role, opens it, and moves it on", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Start tracking/ }).click();

  await expect(page).toHaveURL("/signup");
  await page.getByLabel("Full name").fill("Sam Rivera");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Password").fill("trailhead");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/board");
  await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();

  // ADD-3: a new role lands in Interested.
  await page.getByRole("button", { name: /add job/i }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company").fill("Alpine Robotics");
  await dialog.getByLabel("Role title").fill("Principal Designer");
  await dialog.getByLabel("Location").fill("Remote (US)");
  await dialog.getByRole("button", { name: "Add to board" }).click();

  await expect(dialog).toBeHidden();
  const interested = page.getByRole("region", { name: "Interested" });
  // Exact match: the posting link's screen-reader text also names the company.
  await expect(interested.getByText("Alpine Robotics", { exact: true })).toBeVisible();

  // CARD-2: the card opens its detail page.
  await interested
    .getByRole("link", { name: "Principal Designer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Principal Designer" }),
  ).toBeVisible();

  // DET-3: moving the stage logs the move.
  await page.getByRole("combobox", { name: "Application stage" }).click();
  await page.getByRole("option", { name: "Applied" }).click();
  await expect(
    page.getByRole("region", { name: "Activity" }).getByText("Moved to Applied"),
  ).toBeVisible();

  // The board reflects it on the way back.
  await page.getByRole("link", { name: "Board" }).click();
  await expect(
    page
      .getByRole("region", { name: "Applied" })
      .getByText("Alpine Robotics", { exact: true }),
  ).toBeVisible();
});

test("A11Y-2: the whole board is reachable and operable from the keyboard", async ({
  page,
}) => {
  await page.goto("/board");

  const reached: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    reached.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        // Prefer the accessible name — icon-only controls carry it on aria-label.
        const name = el.getAttribute("aria-label") ?? el.innerText ?? "";
        return `${el.tagName.toLowerCase()}:${name.trim().split("\n")[0]}`;
      }),
    );
  }

  expect(reached[0]).toContain("a:");
  expect(reached.some((entry) => entry.includes("Add job"))).toBe(true);
  expect(reached.some((entry) => entry.includes("Account menu"))).toBe(true);
});

test("A11Y-2: the dialog takes focus on open and returns it on close", async ({
  page,
}) => {
  await page.goto("/board");
  const trigger = page.getByRole("button", { name: /add job/i });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Company")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("DET-2: an unknown job id explains itself instead of erroring", async ({
  page,
}) => {
  const response = await page.goto("/board/not-a-real-job");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /This job isn’t on your trail/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your trail" })).toBeVisible();
});
