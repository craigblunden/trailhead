import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ticket 12: the Phase-1 seed jobs are test fixtures, and production code does not import them. New
 * accounts start empty; the board's empty state is the answer to "restore demo data".
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("fixtures stay in tests (ticket 12)", () => {
  it("FIX-1: nothing under src/ names SEED_JOBS or imports from tests/", () => {
    const offenders = walk(SRC)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /\bSEED_JOBS\b/.test(source) || /from\s+["'][^"']*tests\//.test(source);
      })
      .map((file) => relative(SRC, file).split(sep).join("/"));

    expect(offenders).toEqual([]);
  });

  it("FIX-2: the fixtures module exists where the tests import it from", () => {
    const fixtures = readFileSync(join(process.cwd(), "tests", "fixtures", "jobs.ts"), "utf8");
    expect(fixtures).toMatch(/export const SEED_JOBS: Job\[\]/);
  });
});
