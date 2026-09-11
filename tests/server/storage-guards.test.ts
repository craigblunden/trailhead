import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  DOCUMENT_CAP,
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
} from "@/lib/documents";

/**
 * The storage rules that would silently void tenancy if they drifted, enforced by reading the
 * source tree and configuration (tickets 15, 16). Behaviour against the real bucket is proven in
 * `tests/integration/documents.test.ts`.
 */

const ROOT = process.cwd();

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" || name === "node_modules" ? [] : walk(full, match);
    return match.test(name) ? [full] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

describe("storage guards", () => {
  it("STO-1: no service_role or secret key is referenced anywhere in application code or config", () => {
    const files = [
      ...walk(join(ROOT, "src"), /\.(ts|tsx)$/),
      join(ROOT, ".env.example"),
      join(ROOT, "next.config.ts"),
    ];
    const offenders = files
      .filter((file) =>
        /SERVICE_ROLE|sb_secret_|["']service_role["']|SUPABASE_SECRET/.test(
          // Comments may say the key is absent; code may not reach for it.
          read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$|^#.*$/gm, ""),
        ),
      )
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it("STO-2: the bucket's own limits agree with the application's constants, and it is private", () => {
    const config = read(join(ROOT, "supabase", "config.toml"));
    const bucket = config.slice(config.indexOf("[storage.buckets.documents]"));
    expect(bucket).toMatch(/public = false/);
    expect(bucket).toMatch(/file_size_limit = "5MiB"/);
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    for (const mime of Object.values(ACCEPTED_TYPES)) expect(bucket).toContain(`"${mime}"`);

    const provisioning = read(
      join(ROOT, "supabase", "migrations", "20260911000000_provision_trailhead.sql"),
    );
    expect(provisioning).toMatch(/'documents',\s*'documents',\s*false,\s*5242880/);
    for (const file of [
      ...walk(join(ROOT, "supabase", "migrations"), /\.sql$/),
      ...walk(join(ROOT, "prisma", "migrations"), /\.sql$/),
    ]) {
      expect(read(file), rel(file)).not.toMatch(/on\s+storage\.objects\s+for\s+(update|all)\b/i);
    }
  });

  it("STO-3: signed download URLs live 300 seconds or less, and the cap is a named constant", () => {
    expect(DOWNLOAD_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(DOWNLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(DOCUMENT_CAP).toBe(3);

    const dataLayer = read(join(ROOT, "src", "server", "data", "documents.ts"));
    expect(dataLayer).toMatch(/createSignedUrl\([^)]*DOWNLOAD_URL_TTL_SECONDS/);
    expect(dataLayer).not.toMatch(/count[^;]*>=\s*3\b/);
  });

  it("STO-4: no SQL deletes from storage.objects, and no foreign key or cascade reaches it", () => {
    const sql = [
      ...walk(join(ROOT, "prisma", "migrations"), /\.sql$/),
      ...walk(join(ROOT, "supabase", "migrations"), /\.sql$/),
    ];
    const code = walk(join(ROOT, "src"), /\.(ts|tsx)$/);
    for (const file of [...sql, ...code]) {
      const source = read(file).replace(/--.*$/gm, "");
      expect(source, rel(file)).not.toMatch(/delete\s+from\s+storage\.objects/i);
      expect(source, rel(file)).not.toMatch(/references\s+storage\./i);
    }
    expect(read(join(ROOT, "prisma", "schema.prisma"))).not.toMatch(/storage\./);
  });
});
