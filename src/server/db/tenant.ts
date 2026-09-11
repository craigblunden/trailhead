import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "./prisma";

/** A Prisma client scoped to one tenant for the life of one transaction. */
export type TenantClient = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a transaction whose first statement sets the tenant id as a TRANSACTION-LOCAL
 * setting. The row-level security policies on every application table compare `userId` to that
 * setting, so inside `fn` the database can only see — and only write — this user's rows.
 *
 * Why this survives Supavisor's transaction mode: Postgres itself reverts a transaction-local
 * setting at COMMIT/ROLLBACK, and the pooler cannot reassign the connection before then. The
 * guarantee is server-side. A session-level `SET` is the unsafe thing and must never appear.
 *
 * No external calls inside `fn`: it holds a pooled connection under Prisma's default transaction
 * timeout. Read in one transaction, call out, write in a second.
 */
export async function withTenant<T>(
  userId: string,
  fn: (tx: TenantClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) {
    // A non-uuid would fail the policy's cast anyway; failing here names the real problem.
    throw new Error("withTenant: userId must be a uuid");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.tenant_id', ${userId}, true)`;
    return fn(tx);
  });
}
