/**
 * `npm run db:seed:stress` — creates, or resets, one large pro account on the LOCAL stack for
 * pressure-testing the UI: about fifty randomized jobs, more contacts than any hand-written seed
 * account, and a few documents (`scripts/seed/stress-accounts.ts`).
 *
 * Separate from `npm run db:seed` (`scripts/seed/accounts.ts`) because `tests/seed/accounts.test.ts`
 * pins that list to exactly six agreed accounts; this account is never added to it.
 */
import nextEnv from "@next/env";

// Same precedence as the running app (`.env.local` over `.env`).
nextEnv.loadEnvConfig(process.cwd());

const { buildStressAccount } = await import("./seed/stress-accounts");
const { seedAccount } = await import("./seed/seed");

const PASSWORD = "trailhead-seed";
const account = buildStressAccount();
const email = `${account.key}@trailhead.test`;

try {
  process.stdout.write(`Seeding ${email} … `);
  const note = await seedAccount(account, { email, password: PASSWORD });
  process.stdout.write(note ? `left as it is\n  ${note}\n` : "done\n");
  console.log(`\nSign in at http://127.0.0.1:3000/login — ${email} / ${PASSWORD}`);
  console.log(account.about ?? "");
} catch (error) {
  process.stdout.write("failed\n");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
