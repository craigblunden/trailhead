import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The layering rules, enforced by reading the source tree:
 *
 *   Client Component ──▶ Server Action ──▶ Data Access Layer ──▶ Prisma ──▶ Postgres
 *      (untrusted)         (validates)       (authenticates, scopes by tenant)
 *
 * A rule that lives only in a comment drifts. These fail the unit suite instead.
 */

const ROOT = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = walk(ROOT).map((full) => ({
  path: relative(ROOT, full).split(sep).join("/"),
  source: readFileSync(full, "utf8"),
}));

const imports = (source: string) =>
  Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]).concat(
    Array.from(source.matchAll(/^import\s+"([^"]+)"/gm), (m) => m[1]),
  );

const isDataLayer = (path: string) =>
  path.startsWith("server/db/") || path.startsWith("server/data/");

describe("layering (tickets 10, 11)", () => {
  it("only the data layer imports Prisma", () => {
    const offenders = files
      .filter(({ path }) => !isDataLayer(path))
      .filter(({ source }) =>
        imports(source).some(
          (spec) =>
            spec.startsWith("@/generated/prisma") ||
            spec === "@/server/db/prisma" ||
            spec === "@/server/db/tenant" ||
            spec === "@prisma/client" ||
            spec === "@prisma/adapter-pg",
        ),
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("every data-layer module is server-only, so importing it into a Client Component fails the build", () => {
    const missing = files
      .filter(({ path }) => isDataLayer(path))
      .filter(({ path }) => !path.endsWith("/errors.ts") && !path.endsWith("/mappers.ts") && !path.endsWith("/enum-assertions.ts"))
      .filter(({ source }) => !/^import "server-only";/m.test(source))
      .map(({ path }) => path);

    expect(missing).toEqual([]);
  });

  it("no Client Component imports the data layer directly", () => {
    const offenders = files
      .filter(({ source }) => /^["']use client["']/m.test(source))
      .filter(({ source }) =>
        imports(source).some(
          (spec) => spec.startsWith("@/server/data") || spec.startsWith("@/server/db"),
        ),
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("actions hold no query logic: no `where` clause and no Prisma import", () => {
    const actions = files.filter(({ path }) => path.startsWith("server/actions/"));
    expect(actions.length).toBeGreaterThan(0);

    for (const { path, source } of actions) {
      expect(source, path).toMatch(/^"use server";/);
      expect(source, path).not.toMatch(/\bwhere\s*:/);
      expect(imports(source), path).not.toContain("@/server/db/prisma");
      expect(imports(source), path).not.toContain("@/server/db/tenant");
    }
  });

  it("no function in the data layer accepts a userId from its caller", () => {
    const signatures = files
      .filter(({ path }) => path.startsWith("server/data/"))
      .flatMap(({ path, source }) =>
        Array.from(source.matchAll(/export async function \w+\(([^)]*)\)/g), (m) => ({
          path,
          params: m[1],
        })),
      );

    expect(signatures.length).toBeGreaterThan(0);
    for (const { path, params } of signatures) {
      expect(params, path).not.toMatch(/userId/);
    }
  });
});

describe("the Supabase browser client loads on demand (performance ticket 01)", () => {
  it("no browser-side module imports @supabase/ssr statically; it is imported where it is used", () => {
    const offenders = files
      .filter(({ path }) => !path.startsWith("server/") && path !== "proxy.ts")
      .filter(({ source }) => imports(source).includes("@supabase/ssr"))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
