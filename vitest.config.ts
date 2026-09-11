import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside a React Server Components bundle; under Vitest the data layer is
  // exercised directly in Node, so the guard becomes a no-op module here. The real guard is
  // enforced by `next build` and asserted by `tests/integration/boundaries.test.ts`.
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        // Fast, jsdom, no database. What `npm test` runs.
        // No Babel/SWC plugin: Vitest's built-in oxc transform handles TSX, and its default
        // automatic JSX runtime is what React 19 wants.
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/integration/**"],
          css: false,
        },
      },
      {
        // Node, against the real local Postgres and Supabase stack. A mocked ORM would test the
        // mock rather than the ownership rule, so nothing here mocks Prisma.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./tests/integration/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
          // Every integration test truncates the application tables; running files in parallel
          // would let one test's reset erase another's rows.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "src/server/**"],
      exclude: ["src/components/ui/**", "src/generated/**"],
      thresholds: {
        // Enforced on the pure helpers; component work is judged by requirement coverage, per
        // spec T-4.
        "src/lib/jobs.ts": {
          statements: 90,
          functions: 90,
          branches: 85,
          lines: 90,
        },
      },
    },
  },
});
