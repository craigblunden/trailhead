import { SIGNED_OUT, expect, signUpAndVerify, test } from "./fixtures";

test.describe("the first journey", () => {
  test.use({ storageState: SIGNED_OUT });

  test("US-1…4: a job seeker signs up, adds a role, opens it, and moves it on", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Start tracking/ }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await signUpAndVerify(page);
    await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();

    // ADD-3: a new role lands in Interested.
    await page.getByRole("button", { name: /add job/i }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a job" });
    await dialog.getByLabel("Company").fill("Alpine Robotics");
    await dialog.getByLabel("Role title").fill("Principal Designer");
    await dialog.getByLabel("Location").fill("Remote (US)");
    await dialog.getByRole("button", { name: "Add to board" }).click();

    await expect(dialog).toBeHidden();
    const interested = page.getByRole("region", { name: "Interested" });
    // Exact match: the posting link's screen-reader text also names the company.
    await expect(interested.getByText("Alpine Robotics", { exact: true })).toBeVisible();

    // CARD-2: the card opens its detail page — once the server has assigned its id.
    const card = interested.getByRole("link", { name: "Principal Designer", exact: true });
    await expect(card).not.toHaveAttribute("href", /optimistic/);
    await card.click();
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
    await page.getByRole("link", { name: "Back to board" }).click();
    await expect(
      page.getByRole("region", { name: "Applied" }).getByText("Alpine Robotics", { exact: true }),
    ).toBeVisible();

    // DND-2: dragging the card onto another column moves it on, and the move persists.
    const applied = page.getByRole("region", { name: "Applied" });
    const interviewing = page.getByRole("region", { name: "Interviewing" });
    await applied.getByRole("listitem").filter({ hasText: "Alpine Robotics" }).dragTo(interviewing);
    await expect(interviewing.getByText("Alpine Robotics", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Moved Principal Designer to Interviewing");

    await page.reload();
    await expect(
      page.getByRole("region", { name: "Interviewing" }).getByText("Alpine Robotics", { exact: true }),
    ).toBeVisible();
  });
});

test("A11Y-2: the whole board is reachable and operable from the keyboard", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();

  const reached: string[] = [];
  // Enough stops to cross the header's links — the skip link, the logo, and one per primary-nav
  // route — and reach the page's own controls. A count tight against today's nav would fail the
  // next time a section is added rather than say anything about the keyboard.
  for (let i = 0; i < 12; i += 1) {
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

test("A11Y-2: the dialog takes focus on open and returns it on close", async ({ page }) => {
  await page.goto("/board");
  const trigger = page.getByRole("button", { name: /add job/i }).first();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Company")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("DET-2: an unknown job id explains itself instead of erroring", async ({ page }) => {
  const response = await page.goto("/board/not-a-real-job");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /This job isn’t on your trail/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your trail" })).toBeVisible();
});
