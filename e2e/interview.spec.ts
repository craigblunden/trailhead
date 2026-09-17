import { join } from "node:path";

import type { Page } from "@playwright/test";

import { setPlanByEmail, withMigrator } from "../scripts/plan/set-plan";
import type { Plan } from "../src/lib/plans";

import { expectNoAxeViolations } from "./checks";
import { SIGNED_OUT, createJob, expect, signUpAndVerify, test } from "./fixtures";

/**
 * The Interview Simulator end to end (interview simulator tickets 01–08), against the fake Anthropic
 * API Playwright starts (`tests/fakes/anthropic-server.mjs`). Everything on the app's side — the
 * routes, the quota, the persisted question set, the Answers, the Scorecard — is the real thing.
 *
 * Chromium exposes the speech-recognition API, so the page opens in speaking mode — which is what
 * ticket 06 asks for and is asserted below. Driving it further would need a real speech service to
 * transcribe against, so every answer here goes through the switch to typing, the other half of the
 * same ticket. That both modes write the same field is covered in the component tests, where the API
 * can be stubbed.
 *
 * Speech synthesis is stubbed in every test here (practice round ticket 02): a headless browser's voice
 * may never finish, which would hold each question's clock for its whole guard. The stub finishes at
 * once unless a test says otherwise, and records what it was asked to read.
 */

type VoiceWindow = Window & { __voiceHolds?: boolean; __spoken?: string[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const voiced = window as VoiceWindow;
    voiced.__spoken = [];
    const synth = {
      speaking: false,
      pending: false,
      speak(utterance: SpeechSynthesisUtterance) {
        voiced.__spoken!.push(utterance.text);
        if (!voiced.__voiceHolds) queueMicrotask(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent));
      },
      cancel() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  });
});

const POSTING =
  "Fernwood is a subscription plant company. The Growth design team owns onboarding, pricing, and the referral loop, and works closely with lifecycle marketing and data science. ".repeat(
    3,
  );

const MIGRATOR_URL =
  process.env.DIRECT_URL ?? "postgresql://trailhead_migrator:trailhead_migrator@127.0.0.1:54322/postgres";

/**
 * Puts the Tenant behind `email` on a Plan, through `npm run db:plan`'s own statements as
 * `trailhead_migrator` (ADR-0001). Nothing in the application can do this — the app role has no
 * grant to write "UserPlan" — so a test that wants a `pro` Tenant has to go the same way the
 * operator does.
 */
async function putOnPlan(email: string, plan: Plan) {
  await withMigrator(MIGRATOR_URL, (client) => setPlanByEmail(client, email, plan));
}

/** A Job with a description and an attached resume — both needed before questions can be written. */
async function jobReadyToRehearse(page: Page) {
  const job = await createJob(page, { company: "Fernwood", description: POSTING });
  const kit = page.getByRole("region", { name: "Application kit" });
  await kit
    .getByRole("region", { name: "Upload another" })
    .getByLabel("Choose a file to upload")
    .setInputFiles(join(process.cwd(), "tests", "fixtures", "documents", "resume.pdf"));
  await expect(kit.getByRole("group", { name: "Resume" }).getByText("On 1 job")).toBeVisible();
  return job;
}

/**
 * Answers the question on screen. There is nothing to press to begin it — its clock is already
 * running. `dwellMs` holds the question open that long first: the clock counts whole seconds, and
 * Playwright types faster than one, so a test that wants to see time actually spent has to spend some.
 */
async function answerOne(page: Page, text: string, dwellMs = 0) {
  // Chromium opens in speaking mode with no speech service behind it, so take the typed path.
  // Typing carries across questions once chosen, so wait for whichever this question shows.
  const switchToTyping = page.getByRole("button", { name: "Type instead" });
  const notepad = page.getByRole("textbox", { name: /Your answer to/ });
  await expect(notepad.or(switchToTyping)).toBeVisible();
  if (await switchToTyping.isVisible()) await switchToTyping.click();
  await notepad.fill(text);
  if (dwellMs > 0) await page.waitForTimeout(dwellMs);
  await page.getByRole("button", { name: /^Submit (final )?answer$/ }).click();
}

test.describe("interview simulator: a pro Tenant rehearses and is scored", () => {
  // The Plan is set per account, so this cannot share the worker's account with other specs.
  test.use({ storageState: SIGNED_OUT });

  test("start from a Job, answer every question against one clock, and read the Scorecard", async ({ page }) => {
    test.setTimeout(180_000);
    const account = await signUpAndVerify(page);
    await putOnPlan(account.email, "pro");
    const job = await jobReadyToRehearse(page);

    // Straight from the Job's page, skipping the picker (ticket 07): the path opens with this job chosen.
    await page.getByRole("link", { name: "Practice interview" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Interview Simulator" })).toBeVisible();
    await expect(page.getByText(job.role)).toBeVisible();
    await expect(page.getByRole("link", { name: "Change job" })).toHaveAttribute("href", "/interview");
    await expect(page.getByText(/doesn’t pause between them/)).toBeVisible();

    // The real length choice, and the breakdown that length produces (ticket 05).
    await expect(page.getByRole("button", { name: /^15\s*minutes/ })).toBeEnabled();
    await page.getByRole("button", { name: /^15\s*minutes/ }).click();
    await expect(page.getByText(/1 personal, 1 behavioural, 1 stakeholder, 1 technical, 1 design/)).toBeVisible();

    // Speaking is the default where the browser can transcribe, with the reason beside it (ticket 06).
    await expect(page.getByRole("button", { name: /Speaking/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/no audio is recorded, uploaded, or stored/i)).toBeVisible();

    await page.getByRole("button", { name: "Go" }).click();

    // Go puts the first question up with its one countdown for the whole Attempt already running.
    const clock = page.getByRole("timer");
    await expect(clock).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("personal question");
    // Each question says how long to aim for in its Category (interview second pass ticket 04).
    await expect(page.getByText("Aim for about 1½ min")).toBeVisible();
    await expect(clock).not.toHaveText("15:00 left", { timeout: 5_000 });

    for (let index = 1; index <= 5; index += 1) {
      await expect(page.getByText(new RegExp(`Question ${index} of 5`))).toBeVisible();
      await answerOne(page, `My answer to question ${index}: I led the Meridian reporting redesign.`);
    }

    // Every question answered: what is left is the Scorecard, and it costs no second interview.
    const score = page.getByRole("button", { name: "Score my interview" });
    await expect(score).toBeVisible();
    await expect(page.getByText(/doesn’t use another of this week’s interviews/)).toBeVisible();
    await score.click();

    await expect(page.getByText("Overall")).toBeVisible({ timeout: 60_000 });
    // For next time comes first: the Takeaway, each point saying what it is drawn from (interview
    // second pass ticket 05).
    const next = page.getByRole("region", { name: "For next time" });
    await expect(next).toContainText("Say what came of the work, not only what you did.");
    await expect(next).toContainText("From every answer you gave");
    // Each area as stars and a band word, never a number out of 100 (ticket 02).
    const areas = page.getByRole("region", { name: "By area" });
    for (const category of ["Personal", "Behavioural", "Stakeholder", "Technical", "Design"]) {
      await expect(areas.getByRole("listitem").filter({ hasText: category }).getByRole("img", { name: /^\S+ of 5 stars, / })).toBeVisible();
    }
    await expect(page.getByRole("main")).not.toContainText("/ 100");
    // A card per Answer, with what landed and its Missed points.
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(5);
    for (const card of await cards.all()) {
      await expect(card).toContainText("you named the work you led");
      await expect(card.getByRole("list", { name: "Missed points" }).getByRole("listitem")).toHaveCount(2);
    }
    await expectNoAxeViolations(page);

    // The Scorecard is stored, not just shown: a reload lands back on it rather than a start screen.
    await page.reload();
    await expect(page.getByText("Overall")).toBeVisible();
    await expect(page.getByRole("button", { name: "Score my interview" })).toHaveCount(0);
    const scorecardText = await page.getByRole("region", { name: "For next time" }).textContent();

    // It is on the hub's past interviews, and opens as the same Scorecard at a link of its own
    // (interview second pass ticket 06).
    await page.getByRole("link", { name: "Change job" }).click();
    const past = page.getByRole("region", { name: "Past interviews" });
    const row = past.getByRole("link").filter({ hasText: job.role });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("15 min");
    await expect(row.getByRole("img", { name: /^\S+ of 5 stars, / })).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(/\/interview\/[^/]+\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${job.role} at Fernwood`);
    await expect(page.getByRole("region", { name: "For next time" })).toHaveText(scorecardText!);
    await expect(page.getByRole("article")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Score my interview" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Rehearse this job again" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the clock running out keeps what was half-said, and the questions it never reached read Not reached", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // The browser's clock is the test's to move, so fifteen minutes can pass in a moment.
    await page.clock.install();
    const account = await signUpAndVerify(page);
    await putOnPlan(account.email, "pro");
    await jobReadyToRehearse(page);

    await page.getByRole("link", { name: "Practice interview" }).click();
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page.getByRole("timer")).toBeVisible({ timeout: 60_000 });
    await answerOne(page, "The one answer I finished.");
    await expect(page.getByText(/Question 2 of 5/)).toBeVisible();
    await page.getByRole("textbox", { name: /Your answer to/ }).fill("Half of my second answ");

    // The countdown runs out mid-answer (interview second pass ticket 03).
    await page.clock.fastForward("15:00");

    const score = page.getByRole("button", { name: "Score my interview" });
    await expect(score).toBeVisible({ timeout: 30_000 });
    await score.click();
    await expect(page.getByText("Overall")).toBeVisible({ timeout: 60_000 });

    // What was half-said was kept and scored; the three questions after it were never reached.
    await expect(page.getByText("3 of which you didn’t get to")).toBeVisible();
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(5);
    const halfSaid = cards.nth(1);
    await expect(halfSaid.getByRole("img", { name: /^\S+ of 5 stars, / })).toBeVisible();
    await halfSaid.getByText("What you said").click();
    await expect(halfSaid.getByText("Half of my second answ")).toBeVisible();
    for (const index of [2, 3, 4]) {
      await expect(cards.nth(index)).toContainText("Not reached");
      await expect(cards.nth(index).getByRole("img")).toHaveCount(0);
    }
    const areas = page.getByRole("region", { name: "By area" });
    for (const category of ["Stakeholder", "Technical", "Design"]) {
      await expect(areas.getByRole("listitem").filter({ hasText: category })).toContainText("Not reached");
    }
  });

  test("an interview left mid-way is resumed on the question it reached, with the time it had left", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const account = await signUpAndVerify(page);
    await putOnPlan(account.email, "pro");
    const job = await jobReadyToRehearse(page);

    await page.getByRole("link", { name: "Practice interview" }).click();
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page.getByRole("timer")).toBeVisible({ timeout: 60_000 });
    await answerOne(page, "The one answer I finished before the phone rang.", 3_000);
    await expect(page.getByText(/Question 2 of 5/)).toBeVisible();

    // The tab closes mid-question two, its clock running. Nothing was recorded for it — neither its
    // answer nor its time — and nothing drains while away.
    await page.goto(job.href);
    await page.getByRole("link", { name: "Practice interview" }).click();

    await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();

    // Resume puts question two straight back up — not inside the one abandoned, and with no second press.
    await expect(page.getByText(/Question 2 of 5/)).toBeVisible();
    // The budget is what was left when they walked away — the seconds that first answer took are
    // gone, and nothing drained in between.
    await expect(page.getByRole("timer")).not.toHaveText("15:00 left");
    await expect(page.getByRole("timer")).toHaveText(/^14:5\d left$/);
  });
});

test.describe("interview simulator: questions asked aloud (practice round ticket 02)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("speaking, each question is read aloud with its clock standing still, until the Tenant skips", async ({ page }) => {
    test.setTimeout(180_000);
    const account = await signUpAndVerify(page);
    await putOnPlan(account.email, "pro");
    await jobReadyToRehearse(page);

    await page.getByRole("link", { name: "Practice interview" }).click();
    // The voice reads and reads: only Skip ends it.
    await page.evaluate(() => ((window as VoiceWindow).__voiceHolds = true));
    await page.getByRole("button", { name: "Go" }).click();

    const clock = page.getByRole("timer");
    await expect(clock).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Reading the question aloud/)).toBeVisible();
    const question = await page.getByRole("heading", { level: 1 }).textContent();
    expect(await page.evaluate(() => (window as VoiceWindow).__spoken)).toEqual([question]);
    // Held well past a second, the clock has not moved.
    await page.waitForTimeout(2_500);
    await expect(clock).toHaveText("15:00 left");

    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText(/Reading the question aloud/)).toHaveCount(0);
    await expect(clock).not.toHaveText("15:00 left", { timeout: 5_000 });
  });
});

test.describe("interview simulator: the locked preview (ticket 08)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a free Tenant sees the real start screen, locked, from the nav and from a Job", async ({ page }) => {
    test.setTimeout(180_000);
    await signUpAndVerify(page); // A new account has no Plan row, so it is on `free`.
    const job = await jobReadyToRehearse(page);

    // From the primary navigation, marked as a Pro feature rather than hidden.
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: /Interview/ })).toContainText("Pro");
    await nav.getByRole("link", { name: /Interview/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pro");

    // The picker still works for them: the tease is the start screen, not a wall before it.
    await page.getByRole("searchbox", { name: "Search your jobs by role or company" }).fill("Fernwood");
    await page.getByRole("list", { name: "Matching jobs" }).getByRole("link").first().click();

    await expect(page.getByText(/Interview Simulator is a Pro feature/)).toBeVisible();
    // The real screen: every length, and the real Category breakdown — all of it refused.
    for (const minutes of [15, 20, 30]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${minutes}\\s*minutes`) })).toBeDisabled();
    }
    await expect(page.getByText(/1 personal, 1 behavioural/)).toBeVisible();
    // Not a disabled start button: no start action at all.
    await expect(page.getByRole("button", { name: "Go" })).toHaveCount(0);
    await expectNoAxeViolations(page);

    // The same locked screen from the Job's own page, so the tease does not depend on the way in.
    await page.goto(job.href);
    await page.getByRole("link", { name: "Practice interview" }).click();
    await expect(page.getByText(/Interview Simulator is a Pro feature/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Go" })).toHaveCount(0);
  });
});
