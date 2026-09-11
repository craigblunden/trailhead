import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Same precedence as the running app (`.env.local` over `.env`), so `prisma migrate` and
// `next dev` can never disagree about which database they mean.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations run as `trailhead_migrator` over a direct, session-mode connection. The running
    // application never reads this variable — see `src/server/db/prisma.ts`.
    url: process.env.DIRECT_URL,
  },
});
