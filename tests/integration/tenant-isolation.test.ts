import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { withTenant, type TenantClient } from "@/server/db/tenant";

import { newUserId, resetTables } from "./helpers";

const TABLES = ["Job", "ActivityEntry", "Contact", "JobContact", "Document"] as const;

/** Seeds one row in every application table for `userId`, returning the ids. */
async function seedEverything(tx: TenantClient, userId: string) {
  const job = await tx.job.create({
    data: {
      userId,
      company: "Meridian Labs",
      role: "Senior Product Designer",
      location: "Remote (US)",
      addedOn: new Date("2026-07-22"),
      accent: "moss",
      activity: {
        create: { userId, label: "Added to board — Interested", date: new Date("2026-07-22") },
      },
    },
  });
  const contact = await tx.contact.create({
    data: { userId, name: "Dana Whitfield", kind: "recruiter" },
  });
  await tx.jobContact.create({ data: { userId, jobId: job.id, contactId: contact.id } });
  const document = await tx.document.create({
    data: {
      userId,
      kind: "resume",
      fileName: "resume.pdf",
      storageKey: `${userId}/${job.id}.pdf`,
      mimeType: "application/pdf",
    },
  });
  return { job, contact, document };
}

/** Row counts per table, as seen by whichever client is passed in. */
async function countAll(db: TenantClient | typeof prisma) {
  return {
    Job: await db.job.count(),
    ActivityEntry: await db.activityEntry.count(),
    Contact: await db.contact.count(),
    JobContact: await db.jobContact.count(),
    Document: await db.document.count(),
  };
}

const NOTHING = { Job: 0, ActivityEntry: 0, Contact: 0, JobContact: 0, Document: 0 };

beforeEach(async () => {
  await resetTables();
});

describe("ticket 04: tenant isolation, proven", () => {
  it("RLS is enabled and forced on every application table, with a policy covering read and write", async () => {
    const rows = await prisma.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> '_prisma_migrations'
      order by relname
    `;
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    }

    const policies = await prisma.$queryRaw<
      { tablename: string; cmd: string; qual: string | null; with_check: string | null }[]
    >`
      select tablename, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename
    `;
    expect(policies.map((p) => p.tablename).sort()).toEqual([...TABLES].sort());
    for (const policy of policies) {
      expect(policy.cmd).toBe("ALL");
      expect(policy.qual).toContain("tenant_id()");
      expect(policy.with_check).toContain("tenant_id()");
    }
  });

  it("a query issued outside withTenant() returns zero rows, not all rows", async () => {
    const userA = newUserId();
    await withTenant(userA, (tx) => seedEverything(tx, userA));

    // Same client, same pool, no tenant set: the policies fail closed.
    expect(await countAll(prisma)).toEqual(NOTHING);
  });

  it("user B reads nothing of user A's, in every table", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await withTenant(userA, (tx) => seedEverything(tx, userA));

    const asA = await withTenant(userA, (tx) => countAll(tx));
    expect(asA).toEqual({ Job: 1, ActivityEntry: 1, Contact: 1, JobContact: 1, Document: 1 });

    const asB = await withTenant(userB, (tx) => countAll(tx));
    expect(asB).toEqual(NOTHING);
  });

  it("user B cannot update, delete, or reach user A's rows by id", async () => {
    const userA = newUserId();
    const userB = newUserId();
    const { job, contact, document } = await withTenant(userA, (tx) => seedEverything(tx, userA));

    await withTenant(userB, async (tx) => {
      expect(await tx.job.findUnique({ where: { id: job.id } })).toBeNull();
      expect(await tx.contact.findUnique({ where: { id: contact.id } })).toBeNull();
      expect(await tx.document.findUnique({ where: { id: document.id } })).toBeNull();

      // updateMany/deleteMany report how many rows the policy let through: none.
      expect(await tx.job.updateMany({ where: { id: job.id }, data: { notes: "pwned" } })).toEqual({
        count: 0,
      });
      expect(await tx.job.deleteMany({ where: { id: job.id } })).toEqual({ count: 0 });
      expect(await tx.contact.deleteMany({ where: { id: contact.id } })).toEqual({ count: 0 });
      expect(await tx.document.deleteMany({ where: { id: document.id } })).toEqual({ count: 0 });
    });

    const stillA = await withTenant(userA, (tx) => tx.job.findUnique({ where: { id: job.id } }));
    expect(stillA?.notes).toBe("");
  });

  it("user B cannot write a row that claims to belong to user A", async () => {
    const userA = newUserId();
    const userB = newUserId();

    await expect(
      withTenant(userB, (tx) =>
        tx.job.create({
          data: {
            userId: userA,
            company: "Intruder",
            role: "x",
            location: "x",
            addedOn: new Date("2026-07-22"),
            accent: "moss",
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/);

    expect(await withTenant(userA, (tx) => tx.job.count())).toBe(0);
  });

  it("user B cannot link their own job to user A's contact", async () => {
    const userA = newUserId();
    const userB = newUserId();
    const { contact } = await withTenant(userA, (tx) => seedEverything(tx, userA));
    const jobB = await withTenant(userB, (tx) =>
      tx.job.create({
        data: {
          userId: userB,
          company: "B Co",
          role: "x",
          location: "x",
          addedOn: new Date("2026-07-22"),
          accent: "teal",
        },
      }),
    );

    // The link row itself would belong to B, and foreign-key checks bypass RLS — so the policy's
    // write check must be what refuses a reference to a contact B cannot see.
    await expect(
      withTenant(userB, (tx) =>
        tx.jobContact.create({ data: { userId: userB, jobId: jobB.id, contactId: contact.id } }),
      ),
    ).rejects.toThrow(/row-level security/);

    const linksSeenByA = await withTenant(userA, (tx) =>
      tx.jobContact.findMany({ where: { contactId: contact.id } }),
    );
    expect(linksSeenByA.map((l) => l.jobId)).not.toContain(jobB.id);
  });

  it("user B cannot attach user A's document to their own job", async () => {
    const userA = newUserId();
    const userB = newUserId();
    const { document } = await withTenant(userA, (tx) => seedEverything(tx, userA));

    await expect(
      withTenant(userB, (tx) =>
        tx.job.create({
          data: {
            userId: userB,
            company: "B Co",
            role: "x",
            location: "x",
            addedOn: new Date("2026-07-22"),
            accent: "teal",
            resumeId: document.id,
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("the tenant setting does not leak past the transaction that set it", async () => {
    const userA = newUserId();
    await withTenant(userA, (tx) => seedEverything(tx, userA));

    // Drain the pool with plain queries: whichever connection served withTenant() must now report
    // no tenant, and see no rows.
    const settings = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.$queryRaw<{ tenant: string | null }[]>`select public.tenant_id()::text as tenant`,
      ),
    );
    for (const [row] of settings) {
      expect(row.tenant).toBeNull();
    }
    expect(await countAll(prisma)).toEqual(NOTHING);
  });

  it("concurrent transactions for different tenants each see only their own rows", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await withTenant(userA, (tx) => seedEverything(tx, userA));
    await withTenant(userB, (tx) => seedEverything(tx, userB));

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const userId = i % 2 === 0 ? userA : userB;
        return withTenant(userId, async (tx) => {
          const jobs = await tx.job.findMany();
          return { userId, owners: jobs.map((j) => j.userId) };
        });
      }),
    );
    for (const { userId, owners } of results) {
      expect(owners).toEqual([userId]);
    }
  });

  it("withTenant() refuses a tenant id that is not a uuid", async () => {
    await expect(withTenant("not-a-uuid", async () => 1)).rejects.toThrow(/uuid/);
  });
});
