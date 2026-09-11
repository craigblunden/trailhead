import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { processEnv, type LoadedEnvFiles } from "@next/env";

/**
 * Loads `.env.local` then `.env` into `process.env`, without overriding anything already set.
 *
 * `loadEnvConfig` from `@next/env` would be the obvious call, but under `NODE_ENV=test` it skips
 * `.env.local` by design. The test suites want exactly the file the developer runs the app with,
 * so the two files are read explicitly and handed to the same parser Next uses.
 */
export function loadLocalEnv(dir = process.cwd()) {
  const files: LoadedEnvFiles = [];
  for (const path of [".env.local", ".env"]) {
    const full = join(dir, path);
    try {
      if (!statSync(full).isFile()) continue;
      files.push({ path, contents: readFileSync(full, "utf8"), env: {} });
    } catch {
      // Absent files are fine; the caller checks for the variables it needs.
    }
  }
  processEnv(files, dir, console, true);
}
