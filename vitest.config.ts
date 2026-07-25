import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // No Babel/SWC plugin: Vitest's built-in oxc transform handles TSX, and its
  // default automatic JSX runtime is what React 19 wants.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**"],
      exclude: ["src/components/ui/**"],
      thresholds: {
        // Enforced on the pure helpers; component work is judged by
        // requirement coverage, per spec T-4.
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
