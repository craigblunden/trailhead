import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { test as base, expect, type Page } from "@playwright/test";

import { uniqueEmail, waitForMail } from "./mail";

export type Account = { name: string; email: string; password: string };

export const PASSWORD = "trailhead-pass-1";

export function newAccount(prefix = "e2e"): Account {
  return { name: "Sam Rivera", email: uniqueEmail(prefix), password: PASSWORD };
}

/**
 * The real sign-up journey: form, "check your email", the verification link out of Mailpit,
 * and the landing on the board. Leaves `page` signed in as the new account.
 */
export async function signUpAndVerify(page: Page, account: Account = newAccount()): Promise<Account> {
  const sentAfter = Date.now() - 2_000;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const mail = await waitForMail(account.email, /confirm/i, { after: sentAfter });
  const link = mail.links.find((href) => href.includes("/auth/confirm"));
  expect(link, `verification link in: ${mail.links.join(", ")}`).toBeTruthy();

  await page.goto(link!);
  await expect(page).toHaveURL(/\/board$/);
  await acceptTerms(page);
  return account;
}

/**
 * The terms gate (terms ticket 04) stands between a new session and the rest of the app, whichever
 * way the Account signed in. Every account these tests create meets it once; accepting here is what
 * every other journey in the suite assumes has already happened.
 *
 * Tolerant on purpose: an Account that has already accepted never sees it, and a helper that failed
 * in that case would be a helper every sign-in had to think about.
 */
export async function acceptTerms(page: Page) {
  const heading = page.getByRole("heading", { level: 1, name: "Before you carry on" });
  if (!(await heading.isVisible().catch(() => false))) return;
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(heading).toBeHidden();
}

export async function signIn(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/board$/);
  await acceptTerms(page);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * Adds a job through the real dialog and opens its detail page. Returns the detail URL and the
 * role it was given, so sweeps that need a job page have one this account owns. The role carries
 * a suffix because one worker account serves many tests and the board must stay unambiguous.
 */
export async function createJob(
  page: Page,
  input: { company?: string; role?: string; location?: string; description?: string } = {},
): Promise<{ href: string; role: string }> {
  const job = {
    company: input.company ?? "Alpine Robotics",
    role: input.role ?? `Principal Designer ${Math.random().toString(36).slice(2, 6)}`,
    location: input.location ?? "Remote (US)",
  };
  await page.goto("/board");
  await page.getByRole("button", { name: /add job/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company").fill(job.company);
  await dialog.getByLabel("Role title").fill(job.role);
  if (job.location) await dialog.getByLabel("Location").fill(job.location);
  if (input.description) await dialog.getByLabel("Job description").fill(input.description);
  await dialog.getByRole("button", { name: "Add to board" }).click();
  await expect(dialog).toBeHidden();

  const link = page
    .getByRole("region", { name: "Interested" })
    .getByRole("link", { name: job.role, exact: true });
  // The optimistic card carries a temporary href until the server answers.
  await expect(link).not.toHaveAttribute("href", /optimistic/);
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: job.role })).toBeVisible();
  return { href: href!, role: job.role };
}

/** A storage state with no cookies: the signed-out visitor. */
export const SIGNED_OUT: { cookies: never[]; origins: never[] } = { cookies: [], origins: [] };

type WorkerFixtures = {
  /** One verified account per worker, created through the real sign-up flow. */
  account: Account;
  workerStorageState: string;
};

/**
 * `test` from here runs every spec signed in as a fresh account created once per worker. Specs
 * that need the signed-out view opt out with `test.use({ storageState: SIGNED_OUT })`.
 */
export const test = base.extend<Record<never, never>, WorkerFixtures>({
  storageState: ({ workerStorageState }, provide) => provide(workerStorageState),

  account: [
    async ({ browser }, provide) => {
      // `baseURL` is a test-scoped option; worker fixtures read it from the project instead.
      const baseURL = test.info().project.use.baseURL;
      const context = await browser.newContext({ storageState: SIGNED_OUT, baseURL });
      const page = await context.newPage();
      const account = await signUpAndVerify(page, newAccount(`worker${test.info().parallelIndex}`));
      const dir = join(process.cwd(), ".playwright", "auth");
      mkdirSync(dir, { recursive: true });
      await context.storageState({ path: join(dir, `worker-${test.info().parallelIndex}.json`) });
      await context.close();
      await provide(account);
    },
    { scope: "worker" },
  ],

  workerStorageState: [
    // Depends on `account` so the file exists before any test in the worker opens a page.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async ({ account }, provide) => {
      await provide(join(process.cwd(), ".playwright", "auth", `worker-${test.info().parallelIndex}.json`));
    },
    { scope: "worker" },
  ],
});

export { expect };

/**
 * The server's answer to the Server Action whose request carries `marker`. The screen updates
 * optimistically, so this — not what is drawn — is the proof a write was saved. Other actions run
 * too (the job list refetches when a tab gains focus), so each write is picked out by what it sends.
 */
export function waitForActionAnswer(page: Page, marker: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]) &&
      (response.request().postData() ?? "").includes(marker),
  );
}
