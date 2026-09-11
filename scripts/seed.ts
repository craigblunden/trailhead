/**
 * `npm run db:seed` — creates, or resets, the accounts in `scripts/seed/accounts.ts` on the LOCAL
 * stack, so each flow can be looked at without setting it up by hand. Run it after `npm run
 * db:deploy`; run it again whenever an account should go back to how it started.
 *
 * Every account shares one password, which is printed. They exist only in the local Auth server.
 */
import nextEnv from "@next/env";

// Same precedence as the running app (`.env.local` over `.env`). Loaded before the seed is imported:
// the mail reader takes its URL from the environment when its module loads.
nextEnv.loadEnvConfig(process.cwd());

const { SEED_ACCOUNTS } = await import("./seed/accounts");
const { seedAccount } = await import("./seed/seed");

const PASSWORD = "trailhead-seed";
const emailOf = (key: string) => `${key}@trailhead.test`;

try {
  for (const account of SEED_ACCOUNTS) {
    process.stdout.write(`Seeding ${emailOf(account.key)} … `);
    const note = await seedAccount(account, { email: emailOf(account.key), password: PASSWORD });
    process.stdout.write(note ? `left as it is\n  ${note}\n` : "done\n");
  }

  const width = Math.max(...SEED_ACCOUNTS.map((account) => emailOf(account.key).length));
  console.log(`\nSign in at http://127.0.0.1:3000/login — every account's password is ${PASSWORD}\n`);
  for (const account of SEED_ACCOUNTS) {
    console.log(`  ${emailOf(account.key).padEnd(width)}  ${account.about ?? ""}`);
  }
  console.log("\nMail (verification, password reset) arrives in Mailpit at http://127.0.0.1:54324.");
} catch (error) {
  process.stdout.write("failed\n");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
