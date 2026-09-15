import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { signOut } from "./session-mock";

import { prisma } from "@/server/db/prisma";
import { withTenant, type TenantClient } from "@/server/db/tenant";

import { resetTables, setPlan } from "./helpers";
import { passwordAccount } from "./social-helpers";
import { asJanitor, bucketOf, fixture, realUser } from "./storage-helpers";

/**
 * Account deletion (ADR-0004): one definer function erases the Tenant in scope — every tenant row,
 * then its Auth user — and the janitor sweeps whatever a stale token writes afterwards.
 */

const TENANT_TABLES = ["Job", "ActivityEntry", "Contact", "JobContact", "Document", "GenerationQuota", "UserPlan"] as const;

type Counts = Record<(typeof TENANT_TABLES)[number], number>;

/** One row in every tenant table for `userId`: a Job with its Activity, a linked Contact, a Document, a quota week. */
async function seedTenant(userId: string) {
  await withTenant(userId, async (tx: TenantClient) => {
    const job = await tx.job.create({
      data: {
        userId,
        company: "Meridian Labs",
        role: "Senior Product Designer",
        location: "Remote (US)",
        addedOn: new Date("2026-07-22"),
        accent: "moss",
        activity: { create: { userId, label: "Added to board — Interested", date: new Date("2026-07-22") } },
      },
    });
    const contact = await tx.contact.create({ data: { userId, name: "Dana Whitfield", kind: "recruiter" } });
    await tx.jobContact.create({ data: { userId, jobId: job.id, contactId: contact.id } });
    const document = await tx.document.create({
      data: {
        userId,
        kind: "resume",
        fileName: "resume.pdf",
        storageKey: `${userId}/${job.id}.pdf`,
        mimeType: "application/pdf",
        ingestion: "ready",
      },
    });
    await tx.job.update({ where: { id: job.id }, data: { resumeId: document.id } });
    await tx.generationQuota.create({ data: { userId, weekStart: new Date("2026-07-20"), used: 2 } });
  });
  await setPlan(userId, "pro");
}

/** Every tenant table's rows for `userId`, and whether its Auth user and identities exist — read as `postgres`. */
async function footprint(userId: string) {
  return asJanitor(async (client) => {
    const counts = {} as Counts;
    for (const table of TENANT_TABLES) {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from public."${table}" where "userId" = $1`,
        [userId],
      );
      counts[table] = rows[0].n;
    }
    const auth = await client.query<{ users: number; identities: number }>(
      `select (select count(*)::int from auth.users where id = $1) as users,
              (select count(*)::int from auth.identities where user_id = $1) as identities`,
      [userId],
    );
    return { counts, ...auth.rows[0] };
  });
}

const EVERYTHING: Counts = { Job: 1, ActivityEntry: 1, Contact: 1, JobContact: 1, Document: 1, GenerationQuota: 1, UserPlan: 1 };
const NOTHING: Counts = { Job: 0, ActivityEntry: 0, Contact: 0, JobContact: 0, Document: 0, GenerationQuota: 0, UserPlan: 0 };

const erase = (userId: string) =>
  withTenant(userId, (tx) => tx.$queryRaw<{ erased: number }[]>`select public.erase_my_account() as erased`);

beforeEach(async () => {
  await resetTables();
  signOut();
});

describe("account issue 02: erase_my_account()", () => {
  it("ERASE-1: erases every row of the Tenant in scope, then its Auth user and identities", async () => {
    const { userId } = await passwordAccount({ verify: false });
    await seedTenant(userId);
    expect(await footprint(userId)).toEqual({ counts: EVERYTHING, users: 1, identities: 1 });

    expect(await erase(userId)).toEqual([{ erased: 1 }]);

    expect(await footprint(userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
  });

  it("ERASE-2: another Tenant, set up the same way, is untouched", async () => {
    const a = await passwordAccount({ verify: false });
    const b = await passwordAccount({ verify: false });
    await seedTenant(a.userId);
    await seedTenant(b.userId);

    await erase(a.userId);

    expect(await footprint(b.userId)).toEqual({ counts: EVERYTHING, users: 1, identities: 1 });
  });

  it("ERASE-3: with no Tenant in scope it raises and erases nothing", async () => {
    const { userId } = await passwordAccount({ verify: false });
    await seedTenant(userId);

    await expect(prisma.$queryRaw`select public.erase_my_account()`).rejects.toThrow(/no tenant/i);
    await expect(
      prisma.$transaction((tx) => tx.$queryRaw`select public.erase_my_account()`),
    ).rejects.toThrow(/no tenant/i);

    expect(await footprint(userId)).toEqual({ counts: EVERYTHING, users: 1, identities: 1 });
  });

  it("ERASE-4: a second call for the same Tenant returns 0 and does not raise", async () => {
    const { userId } = await passwordAccount({ verify: false });
    await seedTenant(userId);

    await erase(userId);
    expect(await erase(userId)).toEqual([{ erased: 0 }]);
  });

  it("ERASE-5: the function is the only path — the app role still cannot delete an Auth user or write a Plan", async () => {
    const { userId } = await passwordAccount({ verify: false });
    await seedTenant(userId);

    await expect(
      withTenant(userId, (tx) => tx.$executeRaw`delete from auth.users where id = ${userId}::uuid`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(userId, (tx) => tx.userPlan.deleteMany({ where: { userId } })),
    ).rejects.toThrow(/permission denied/);
    expect(await footprint(userId)).toEqual({ counts: EVERYTHING, users: 1, identities: 1 });
  });

  it("ERASE-6: no definer function in public is executable by anon, authenticated, or service_role", async () => {
    const exposed = await asJanitor(async (client) => {
      const { rows } = await client.query<{ fn: string; role: string }>(
        `select p.proname as fn, r.role
           from pg_proc p
          cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
          where p.pronamespace = 'public'::regnamespace
            and p.prosecdef
            and has_function_privilege(r.role, p.oid, 'EXECUTE')
          order by 1, 2`,
      );
      return rows;
    });
    expect(exposed).toEqual([]);
  });

  it("ERASE-7: only trailhead_app may call it", async () => {
    const callers = await asJanitor(async (client) => {
      const { rows } = await client.query<{ role: string }>(
        `select r.rolname as role
           from pg_roles r
          where has_function_privilege(r.oid, 'public.erase_my_account()', 'EXECUTE')
            and not r.rolsuper
            and r.rolname not in ('postgres')
          order by 1`,
      );
      return rows.map((row) => row.role);
    });
    expect(callers).toEqual(["trailhead_app"]);
  });
});

describe("account issue 03: the janitor sweeps rows with no Account", () => {
  /** Longer ago than an access token lives, so no stale token can still be writing. */
  const longAgo = () => new Date(Date.now() - 3 * 60 * 60 * 1000);

  const sweep = () =>
    asJanitor(async (client) => (await client.query<{ n: number }>("select public.sweep_accountless() as n")).rows[0].n);

  /** What a second tab with a still-valid token writes after the Account is gone, dated `at`. */
  async function staleWrites(userId: string, at: Date, keys: string[]) {
    await withTenant(userId, async (tx) => {
      await tx.job.create({
        data: {
          userId,
          company: "Harbor & Co",
          role: "Design Lead",
          location: "Hybrid",
          addedOn: new Date("2026-07-22"),
          accent: "teal",
          createdAt: at,
          updatedAt: at,
        },
      });
      await tx.contact.create({ data: { userId, name: "Lee Park", createdAt: at, updatedAt: at } });
      for (const storageKey of keys) {
        await tx.document.create({
          data: {
            userId,
            kind: "resume",
            fileName: "late.pdf",
            storageKey,
            mimeType: "application/pdf",
            createdAt: at,
            updatedAt: at,
          },
        });
      }
    });
  }

  it("SWEEP-1: rows written for an erased Account by a stale token are swept; another Tenant's are not", async () => {
    const a = await passwordAccount({ verify: false });
    const b = await passwordAccount({ verify: false });
    await seedTenant(b.userId);
    await erase(a.userId);

    await staleWrites(a.userId, longAgo(), []);
    expect(await footprint(a.userId)).toMatchObject({ counts: { Job: 1, Contact: 1 } });

    expect(await sweep()).toBe(2);
    expect(await footprint(a.userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
    expect(await footprint(b.userId)).toEqual({ counts: EVERYTHING, users: 1, identities: 1 });
    expect(await sweep()).toBe(0);
  });

  it("SWEEP-2: a row written within an access token's life is left for a later sweep", async () => {
    const a = await passwordAccount({ verify: false });
    await erase(a.userId);

    await staleWrites(a.userId, new Date(), []);

    expect(await sweep()).toBe(0);
    expect(await footprint(a.userId)).toMatchObject({ counts: { Job: 1, Contact: 1 } });
  });

  it("SWEEP-3: a Document row with no Account survives while its object exists, and goes once it is gone", async () => {
    const a = await realUser();
    const kept = `${a.userId}/${randomUUID()}.pdf`;
    const missing = `${a.userId}/${randomUUID()}.pdf`;
    const put = await bucketOf(a).upload(kept, fixture("resume.pdf"), { contentType: "application/pdf" });
    expect(put.error).toBeNull();

    await erase(a.userId);
    await staleWrites(a.userId, longAgo(), [kept, missing]);

    // The Job, the Contact, and the Document whose object never arrived.
    expect(await sweep()).toBe(3);
    const remaining = await asJanitor(
      async (client) =>
        (await client.query<{ storageKey: string }>(`select "storageKey" from public."Document" where "userId" = $1`, [a.userId]))
          .rows,
    );
    expect(remaining).toEqual([{ storageKey: kept }]);

    // The stale token still satisfies Storage's policies, so the object can go the ordinary way.
    const removed = await bucketOf(a).remove([kept]);
    expect(removed.error).toBeNull();
    expect(await sweep()).toBe(1);
    expect(await footprint(a.userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
  });

  it("SWEEP-4: pg_cron runs it on a schedule of its own", async () => {
    const job = await asJanitor((client) =>
      client.query<{ schedule: string; command: string }>(
        "select schedule, command from cron.job where jobname = 'trailhead-sweep-accountless'",
      ),
    );
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0].command).toContain("public.sweep_accountless()");
  });
});
