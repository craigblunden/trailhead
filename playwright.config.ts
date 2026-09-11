import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Windows exhausts ephemeral sockets against a local server well before the
  // default worker count, surfacing as ERR_NO_BUFFER_SPACE on navigation.
  workers: 4,
  reporter: process.env.CI ? "github" : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Runs the production build: dev-mode overlays and HMR sockets skew both
    // the axe results and the overflow measurements.
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    // Placeholder OAuth credentials, so the social buttons render and every sweep covers them.
    // They reach no provider: `e2e/social-sign-in.spec.ts` routes sign-in to a fake one. A server
    // reused locally must have been started with them too, or the social spec fails.
    env: {
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "e2e-placeholder",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "e2e-placeholder",
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: "e2e-placeholder",
      SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: "e2e-placeholder",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
