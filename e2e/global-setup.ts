import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where the run's start time is kept, for `global-teardown.ts` to find the accounts this run made. */
export const RUN_STARTED_AT = join(process.cwd(), ".playwright", "run-started-at");

/**
 * Records when this run started. Every account an e2e test creates is new and unique, so no run
 * depends on a previous one; the teardown uses this to remove exactly the accounts this run created
 * and nothing older.
 */
export default function globalSetup() {
  mkdirSync(join(process.cwd(), ".playwright"), { recursive: true });
  // A minute of margin for clock skew between this process and the database container.
  writeFileSync(RUN_STARTED_AT, new Date(Date.now() - 60_000).toISOString());
}
