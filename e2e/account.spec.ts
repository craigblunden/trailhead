import { join } from "node:path";

import pg from "pg";

import { expectNoAxeViolations } from "./checks";
import { SIGNED_OUT, createJob, expect, signUpAndVerify, test } from "./fixtures";

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", "documents", name);

/** Runs SQL as `postgres` on the local stack, to see what is left once the Account is gone. */
async function asPostgres<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString: process.env.TEST_POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

test.describe("account issue 07: Account deletion, end to end", () => {
  // Deleting the worker's shared account would end every other test in the worker.
  test.use({ storageState: SIGNED_OUT });

  test("a fresh Account with a Job, a Contact, and a Document is erased, and cannot sign in again", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const account = await signUpAndVerify(page);
    const userId = await asPostgres(
      async (client) =>
        (await client.query<{ id: string }>("select id from auth.users where email = $1", [account.email])).rows[0].id,
    );

    // A Job, with a Document uploaded from its kit and a Contact linked to it.
    await createJob(page, { company: "Fernwood" });
    const kit = page.getByRole("region", { name: "Application kit" });
    await kit.getByRole("region", { name: "Upload another" }).getByLabel("Choose a file to upload").setInputFiles(fixture("resume.pdf"));
    const resumeGroup = kit.getByRole("group", { name: "Resume" });
    await expect(resumeGroup.getByText("On 1 job")).toBeVisible();

    const contacts = page.getByRole("region", { name: "Contacts" });
    await contacts.getByRole("button", { name: "Add contact" }).click();
    const search = page.getByRole("dialog", { name: "Add a contact" });
    await search.getByLabel("Search your contacts").fill("Dana Whitfield");
    await search.getByRole("button", { name: "Create “Dana Whitfield”" }).click();
    const create = page.getByRole("dialog", { name: "Create a contact" });
    await create.getByRole("button", { name: "Create and add" }).click();
    await expect(create).toBeHidden();
    await expect(contacts.getByRole("link", { name: "Dana Whitfield", exact: true })).toBeVisible();

    // The account page, from the user menu.
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    const plan = page.getByRole("region", { name: "Your plan" });
    await expect(plan.getByText("Free plan")).toBeVisible();
    await expect(plan.getByText("1 of 3 documents")).toBeVisible();

    await page.getByRole("region", { name: "Delete account" }).getByRole("button", { name: "Delete account…" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog).toContainText("1 job, 1 document, and 1 contact");
    await expectNoAxeViolations(page);

    const confirm = dialog.getByRole("button", { name: "Delete my account" });
    const email = dialog.getByLabel(`Type ${account.email} to confirm`);
    await email.fill("someone-else@example.com");
    await expect(confirm).toBeDisabled();
    await email.fill(` ${account.email.toUpperCase()} `);
    await confirm.click();

    // Landed on the landing page, told once, with the flag gone from the address.
    const notice = page.getByRole("status").filter({ hasText: "Your account and everything in it has been deleted." });
    await expect(notice).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      "That email and password don't match.",
    );

    const left = await asPostgres(async (client) => {
      const count = async (sql: string) => (await client.query<{ n: number }>(sql, [userId])).rows[0].n;
      const rows: Record<string, number> = {};
      for (const table of ["Job", "ActivityEntry", "Contact", "JobContact", "Document", "GenerationQuota", "UserPlan"]) {
        rows[table] = await count(`select count(*)::int as n from public."${table}" where "userId" = $1`);
      }
      return {
        rows,
        objects: await count(
          "select count(*)::int as n from storage.objects where bucket_id = 'documents' and name like $1::text || '/%'",
        ),
        users: await count("select count(*)::int as n from auth.users where id = $1"),
      };
    });
    expect(left).toEqual({
      rows: { Job: 0, ActivityEntry: 0, Contact: 0, JobContact: 0, Document: 0, GenerationQuota: 0, UserPlan: 0 },
      objects: 0,
      users: 0,
    });
  });
});
