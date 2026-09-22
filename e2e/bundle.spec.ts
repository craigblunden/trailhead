import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Ticket 18, and footing ticket 01: both AI provider keys are read server-side only. The build the
 * e2e server runs was made with marker keys (`playwright.config.ts`), so if a key — or even the
 * variable's name — had been inlined into anything shipped to a browser, it would be in
 * `.next/static`.
 */
for (const { name, marker, variable } of [
  { name: "GEN-K1", marker: "e2e-fake-anthropic-key", variable: "ANTHROPIC" },
  { name: "FOOT-K1", marker: "e2e-fake-typesafe-key", variable: "TYPESAFE" },
] as const) {
  test(`${name}: the ${variable} key and its variable name appear in no client bundle`, () => {
    const files = walk(join(process.cwd(), ".next", "static")).filter((file) => /\.(js|css|json|map)$/.test(file));
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes(marker) || source.includes(variable);
    });
    expect(offenders).toEqual([]);
  });
}
