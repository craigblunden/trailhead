import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Architecture ticket 06: the jobs data module is the one that reads a Job — by id, as the board sees
 * it, or to check it is the Tenant's. Every other data module asks it, so a new relation on a Job is
 * one edit and the ownership check for a Job is written once.
 */

const DATA = join(process.cwd(), "src", "server", "data");

const source = (name: string) => readFileSync(join(DATA, name), "utf8");

describe("reading a Job back (architecture ticket 06)", () => {
  it("JOBREAD-1: no data module but jobs knows the Job's query shape, maps Job rows, or looks a Job up by id", () => {
    const offenders = readdirSync(DATA)
      .filter((name) => name.endsWith(".ts") && name !== "jobs.ts")
      .flatMap((name) =>
        [/\bJOB_INCLUDE\b/, /\btoJobDto\b/, /\.job\.find(First|Unique|Many)(OrThrow)?\(/]
          .filter((pattern) => pattern.test(source(name)))
          .map((pattern) => `${name}: ${pattern.source}`),
      );

    expect(offenders).toEqual([]);
  });

  it("JOBREAD-2: the Job's query shape does not leave the jobs module", () => {
    expect(source("jobs.ts")).not.toMatch(/export const JOB_INCLUDE/);
  });
});
