import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signOut } from "./session-mock";

import { ACCOUNT_DELETION_FAILURES } from "@/server/action-result";
import { deleteAccountAction } from "@/server/actions/account";
import { accountSummary, deleteAccount } from "@/server/data/account";
import { deleteDocument, finishUpload, startUpload } from "@/server/data/documents";
import { AccountDeletionError } from "@/server/data/errors";
import { prisma } from "@/server/db/prisma";
import { withTenant, type TenantClient } from "@/server/db/tenant";

import { resetTables, setPlan } from "./helpers";
import { passwordAccount } from "./social-helpers";
import {
  actAs,
  asJanitor,
  bucketOf,
  fixture,
  objectExists,
  putObject,
  realUser,
  type RealUser,
} from "./storage-helpers";

/** A pass-through over the real bucket that can fail its next listing or removal, or list nothing. */
const hooks = vi.hoisted(() => ({ failNextList: false, failNextRemove: false, listNothing: false }));

vi.mock("@/server/storage/documents-bucket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/storage/documents-bucket")>();
  return {
    ...actual,
    documentsBucket: async () => {
      const bucket = await actual.documentsBucket();
      return new Proxy(bucket, {
        get(target, property) {
          if (property === "list" && hooks.failNextList) {
            hooks.failNextList = false;
            return async () => ({ data: null, error: new Error("Storage is unreachable") });
          }
          if (property === "list" && hooks.listNothing) {
            return async () => ({ data: [], error: null });
          }
          if (property === "remove" && hooks.failNextRemove) {
            hooks.failNextRemove = false;
            return async () => ({ data: null, error: new Error("Storage is unreachable") });
          }
          const value = Reflect.get(target, property) as unknown;
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
    },
  };
});

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

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
  Object.assign(hooks, { failNextList: false, failNextRemove: false, listNothing: false });
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

describe("account issue 04: deleting an Account in the data layer", () => {
  let logged: { info: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    logged = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The full upload as the browser drives it: start, PUT to Storage, finish. */
  async function upload(user: RealUser, kind: "resume" | "cover_letter" = "resume") {
    actAs(user);
    const bytes = fixture("resume.pdf");
    const ticket = await startUpload({ kind, fileName: "resume.pdf", sizeBytes: bytes.length });
    expect((await putObject(user, ticket, bytes)).error).toBeNull();
    await finishUpload(ticket.documentId);
    return ticket;
  }

  /** Objects under the user's prefix, as `postgres` reads `storage.objects`. */
  const objectsOf = (userId: string) =>
    asJanitor(
      async (client) =>
        (
          await client.query<{ n: number }>(
            "select count(*)::int as n from storage.objects where bucket_id = 'documents' and name like $1",
            [`${userId}/%`],
          )
        ).rows[0].n,
    );

  /** A Tenant with two uploaded Documents, a tombstone, a Job, and a Contact. Leaves `user` signed in. */
  async function populated(user: RealUser) {
    await upload(user);
    await upload(user, "cover_letter");
    const third = await upload(user);
    await deleteDocument(third.documentId);
    await withTenant(user.userId, async (tx) => {
      await tx.job.create({
        data: {
          userId: user.userId,
          company: "Meridian Labs",
          role: "Designer",
          location: "Remote",
          addedOn: new Date("2026-07-22"),
          accent: "moss",
        },
      });
      await tx.contact.create({ data: { userId: user.userId, name: "Dana Whitfield" } });
    });
  }

  const jsonLines = (spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] =>
    spy.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string) as Record<string, unknown>);

  it("ACCT-4: the summary counts Jobs, held Documents, and Contacts, and names the Plan and sign-in", async () => {
    const alex = await realUser();
    await populated(alex);
    await setPlan(alex.userId, "basic");

    expect(await accountSummary()).toEqual({
      name: "Tester",
      email: alex.email,
      providers: ["email"],
      plan: "basic",
      jobs: 1,
      documents: 2,
      contacts: 1,
    });
  });

  it("DEL-1: removes every object under the prefix, every row, and the Auth user; another Tenant keeps everything", async () => {
    const [alex, blair] = await Promise.all([realUser(), realUser()]);
    await populated(blair);
    await populated(alex);
    // An object no row knows about still goes: the listing finds it.
    const stray = await bucketOf(alex).upload(`${alex.userId}/stray.pdf`, fixture("resume.pdf"), {
      contentType: "application/pdf",
    });
    expect(stray.error).toBeNull();
    expect(await objectsOf(alex.userId)).toBe(3);

    await deleteAccount();

    expect(await objectsOf(alex.userId)).toBe(0);
    expect(await footprint(alex.userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
    expect((await alex.client.auth.getSession()).data.session).toBeNull();

    expect(await objectsOf(blair.userId)).toBe(2);
    expect(await footprint(blair.userId)).toMatchObject({ users: 1, counts: { Job: 1, Contact: 1, Document: 3 } });

    const events = jsonLines(logged.info).filter((line) => line.operation === "account.delete");
    expect(events).toEqual([expect.objectContaining({ level: "info", tenant: alex.userId })]);
    expect(JSON.stringify([logged.info.mock.calls, logged.error.mock.calls])).not.toContain(alex.email);
  });

  it("DEL-2: an object the listing misses is still removed, by its Document row's key", async () => {
    const alex = await realUser();
    const ticket = await upload(alex);
    hooks.listNothing = true;

    await deleteAccount();

    expect(await objectExists(alex, ticket.path)).toBe(false);
    expect(await objectsOf(alex.userId)).toBe(0);
  });

  it("DEL-3: a Storage failure stops before Postgres — nothing is erased, and the step is named", async () => {
    const alex = await realUser();
    await populated(alex);
    const before = await footprint(alex.userId);

    hooks.failNextRemove = true;
    const removal = await deleteAccount().catch((error: unknown) => error);
    expect(removal).toBeInstanceOf(AccountDeletionError);
    expect((removal as AccountDeletionError).step).toBe("storage");

    hooks.failNextList = true;
    await expect(deleteAccount()).rejects.toMatchObject({ step: "storage" });

    expect(await footprint(alex.userId)).toEqual(before);
    expect(await objectsOf(alex.userId)).toBe(2);
    expect(jsonLines(logged.error)).toEqual([
      expect.objectContaining({ operation: "account.delete", tenant: alex.userId, step: "storage" }),
      expect.objectContaining({ operation: "account.delete", tenant: alex.userId, step: "storage" }),
    ]);
  });

  it("DEL-4: an erase failure after Storage leaves the board intact, and calling again finishes", async () => {
    const alex = await realUser();
    await populated(alex);
    const before = await footprint(alex.userId);

    await withEraseRevoked(async () => {
      await expect(deleteAccount()).rejects.toMatchObject({ step: "erase" });
    });
    expect(await objectsOf(alex.userId)).toBe(0);
    expect(await footprint(alex.userId)).toEqual(before);

    await deleteAccount();
    expect(await footprint(alex.userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
  });

  it("ACCT-5: the action refuses an email that is not the Account's, touching nothing", async () => {
    const alex = await realUser();
    await populated(alex);

    const result = await deleteAccountAction("someone-else@example.com");

    expect(result).toMatchObject({ ok: false, error: "rejected", code: "email-mismatch" });
    expect(await objectsOf(alex.userId)).toBe(2);
    expect((await footprint(alex.userId)).users).toBe(1);
  });

  it("ACCT-6: the action accepts the email with other casing and spaces, erases, and lands on the notice", async () => {
    const alex = await realUser();
    await populated(alex);

    await expect(deleteAccountAction(`  ${alex.email.toUpperCase()} `)).rejects.toThrow("NEXT_REDIRECT:/?deleted=1");

    expect(await footprint(alex.userId)).toEqual({ counts: NOTHING, users: 0, identities: 0 });
  });

  it("ACCT-7: each failed step comes back as its written message", async () => {
    const alex = await realUser();
    await populated(alex);

    hooks.failNextRemove = true;
    expect(await deleteAccountAction(alex.email)).toEqual({
      ok: false,
      error: "failed",
      code: "storage",
      message: ACCOUNT_DELETION_FAILURES.storage,
    });

    await withEraseRevoked(async () => {
      expect(await deleteAccountAction(alex.email)).toEqual({
        ok: false,
        error: "failed",
        code: "erase",
        message: ACCOUNT_DELETION_FAILURES.erase,
      });
    });
  });
});

/** Makes the erase step fail for real: the app role loses EXECUTE on the function until `run` settles. */
async function withEraseRevoked(run: () => Promise<void>) {
  await asJanitor((client) => client.query("revoke execute on function public.erase_my_account() from trailhead_app"));
  try {
    await run();
  } finally {
    await asJanitor((client) => client.query("grant execute on function public.erase_my_account() to trailhead_app"));
  }
}
