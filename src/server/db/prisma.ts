import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * The one place a database URL is read. Everything runs as `trailhead_app` (NOBYPASSRLS) through
 * Supavisor in transaction mode, so a query outside `withTenant()` sees no rows at all.
 *
 * Pool size is set on the `pg` pool: `?connection_limit=` and `?pgbouncer=true` in the URL are
 * inert under a driver adapter. Kept small because every serverless instance gets its own pool
 * and the pooler multiplexes behind it.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

// `next dev` re-evaluates modules on every change; without the global the pool count climbs
// with each edit until the pooler refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Created on first use rather than at import, so a module that merely reaches this file — a
 * Server Action imported by a Client Component's module graph, say — does not need a database
 * URL until something actually queries.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
