import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { todayUtc } from "@/lib/dates";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { weekStartOf } from "@/lib/generation";
import { toDateColumn } from "@/server/db/mappers";

import { waitForMail } from "../../e2e/mail";
import { setPlanForUser } from "../plan/set-plan";

import { assertLocalStack } from "./local-only";
import { planAccount, type PlannedAccount, type SeedAccount } from "./plan";

/**
 * Writes one planned account to the LOCAL stack, with no key that bypasses anything:
 *
 * - **The account** is made through Auth's public API with the publishable key — sign up, then the
 *   real verification mail out of Mailpit — exactly as `tests/integration/social-helpers.ts` does.
 * - **Rows** are written as `trailhead_app` under the account's own tenant id, so the same row-level
 *   security that guards the app decides what the seed may write.
 * - **The Plan** is the one row the app role may not write (ADR-0001), so it is set the way
 *   `npm run db:plan` sets it: as `trailhead_migrator`, over `DIRECT_URL`.
 * - **Files** go to Storage through the account's own session, under the same storage policies.
 *
 * Seeding an account that already exists resets it to its plan: the tenant's files and rows go, then
 * the plan is written again. Whatever was done while signed in as it is gone.
 */

/** Where a seeded account's verification link points: the app `npm run dev` serves. */
const CONFIRM_URL = "http://127.0.0.1:3000/auth/confirm";

/** The same check `withTenant()` makes before it sets a tenant id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TenantClient = Prisma.TransactionClient;
type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

export type SeedOptions = {
  email: string;
  password: string;
  /** The clock the plan's dates and this week's quota are read from. */
  now?: Date;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return value;
}

/** A browser-less Auth client whose session lives in memory for this run and nowhere else. */
function authClient(): SupabaseClient {
  const store = new Map<string, string>();
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
}

/** The transaction-local tenant `withTenant()` sets; that module is server-only, so not importable here. */
function asTenant<T>(prisma: PrismaClient, userId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("asTenant: userId must be a uuid");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.tenant_id', ${userId}, true)`;
      return fn(tx);
    },
    // A whole account's rows in one transaction can outlast Prisma's 5-second default through the
    // pooler. Nothing external runs inside it: files are uploaded between the two transactions.
    { timeout: 30_000 },
  );
}

/**
 * A creation time on a planned day. The seconds keep the order things were written in, which is
 * what the board, history, and documents list sort by within a day.
 */
const createdOn = (iso: string, order: number) => new Date(toDateColumn(iso).getTime() + order * 1000);

async function followVerificationMail(client: SupabaseClient, email: string, sentAfter: number) {
  const mail = await waitForMail(email, /confirm/i, { after: sentAfter });
  const link = mail.links.find((href) => href.includes("token_hash"));
  if (!link) throw new Error(`The verification mail to ${email} carried no link`);
  const { data, error } = await client.auth.verifyOtp({
    type: "signup",
    token_hash: new URL(link).searchParams.get("token_hash") ?? "",
  });
  if (error || !data.user) throw error ?? new Error(`Verifying ${email} returned no user`);
  return { userId: data.user.id };
}

/**
 * Signed in and ready to be written, or skipped: `null` for an account meant to stay unverified that
 * still is, a note for one that cannot be put back as planned.
 */
type Ensured = { userId: string } | { skipped: string | null };

/** Signs in as the account, creating and verifying it first if it does not exist yet. */
async function ensureAccount(
  client: SupabaseClient,
  plan: PlannedAccount,
  email: string,
  password: string,
): Promise<Ensured> {
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (!signedIn.error) {
    if (!plan.verified) {
      // Someone followed its verification link. Auth has no public way to undo that, and failing the
      // whole run over the one flow that was used as intended helps nobody.
      return {
        skipped: `${email} is already verified, which seeding cannot undo, so it was left as it is. Run npm run db:reset to start it over.`,
      };
    }
    return { userId: signedIn.data.user.id };
  }

  if (/not confirmed/i.test(signedIn.error.message)) {
    if (!plan.verified) return { skipped: null };
    const sentAfter = Date.now() - 2_000;
    const resent = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: CONFIRM_URL } });
    if (resent.error) throw resent.error;
    return followVerificationMail(client, email, sentAfter);
  }
  if (!/invalid/i.test(signedIn.error.message)) throw signedIn.error;

  const sentAfter = Date.now() - 2_000;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: plan.name }, emailRedirectTo: CONFIRM_URL },
  });
  // Auth answers a sign-up for an address it already has either with that error or, where it hides
  // registrations, with a user holding no identities: the account exists, and the seed's password
  // is not its password.
  const alreadyRegistered = error
    ? /already registered|already exists/i.test(error.message)
    : !data.user || data.user.identities?.length === 0;
  if (error && !alreadyRegistered) throw error;
  if (alreadyRegistered) {
    throw new Error(
      `${email} already exists with a password that is not the seed's. Reset it at /forgot-password, ` +
        "or run npm run db:reset and seed again.",
    );
  }
  if (!plan.verified) return { skipped: null };
  return followVerificationMail(client, email, sentAfter);
}

/**
 * Files first, through the owner's session — Storage checks the owner on every removal — then the
 * rows, so a row is never gone while its file remains. The quota counter is not deleted (the app role
 * may not); writing the plan sets this week's.
 *
 * Documents are hard-deleted, not tombstoned as the app does. A tombstone outlives a signed upload URL
 * that may still be used; if an upload started in the app before this reset finishes afterwards, its
 * file lands under a key no row tracks, and the next seed's folder sweep removes it. For local seed
 * accounts, that is the price of a reset that finishes in one run.
 */
async function clearTenant(prisma: PrismaClient, bucket: Bucket, userId: string) {
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) throw error;
    if (!data || data.length === 0) break;
    const removed = await bucket.remove(data.map((object) => `${userId}/${object.name}`));
    if (removed.error) throw removed.error;
  }
  await asTenant(prisma, userId, async (tx) => {
    await tx.jobContact.deleteMany({ where: { userId } });
    await tx.activityEntry.deleteMany({ where: { userId } });
    await tx.job.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.document.deleteMany({ where: { userId } });
  });
}

async function writeTenant(prisma: PrismaClient, bucket: Bucket, userId: string, plan: PlannedAccount, now: Date) {
  // The app's upload order: the row exists before its file, and becomes ready once the file is there.
  // Created now, so the document sweep cannot take a pending row for an abandoned upload meanwhile.
  const pending = await asTenant(prisma, userId, async (tx) => {
    const rows = [];
    for (const document of plan.documents) {
      rows.push(
        await tx.document.create({
          data: {
            userId,
            kind: document.kind,
            fileName: document.fileName,
            storageKey: `${userId}/${randomUUID()}.pdf`,
            mimeType: document.mimeType,
            sizeBytes: document.bytes.byteLength,
            ingestion: "pending",
          },
          select: { id: true, storageKey: true },
        }),
      );
    }
    return rows;
  });
  for (const [index, document] of plan.documents.entries()) {
    const { error } = await bucket.upload(pending[index].storageKey, document.bytes, {
      contentType: document.mimeType,
    });
    if (error) throw error;
  }
  const documentIds = new Map(plan.documents.map((document, index) => [document.key, pending[index].id]));

  await asTenant(prisma, userId, async (tx) => {
    for (const [index, document] of plan.documents.entries()) {
      await tx.document.update({
        where: { id: pending[index].id, userId },
        data: { ingestion: "ready", text: document.text, createdAt: createdOn(document.uploadedOn, index) },
      });
    }

    const contactIds = new Map<string, string>();
    for (const { key, lastSpokenOn, ...fields } of plan.contacts) {
      const row = await tx.contact.create({
        data: { userId, ...fields, lastSpokenOn: lastSpokenOn ? toDateColumn(lastSpokenOn) : null },
        select: { id: true },
      });
      contactIds.set(key, row.id);
    }

    for (const [index, job] of plan.jobs.entries()) {
      await tx.job.create({
        data: {
          userId,
          company: job.company,
          role: job.role,
          location: job.location,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          postingUrl: job.postingUrl,
          description: job.description,
          notes: job.notes,
          stage: job.stage,
          accent: job.accent,
          addedOn: toDateColumn(job.addedOn),
          appliedOn: job.appliedOn ? toDateColumn(job.appliedOn) : null,
          resumeId: job.resume ? documentIds.get(job.resume) : null,
          coverLetterId: job.coverLetter ? documentIds.get(job.coverLetter) : null,
          createdAt: createdOn(job.addedOn, index),
          activity: {
            create: job.activity.map((entry, order) => ({
              userId,
              label: entry.label,
              date: toDateColumn(entry.date),
              createdAt: createdOn(entry.date, order),
            })),
          },
          contacts: { create: job.contacts.map((key) => ({ userId, contactId: contactIds.get(key)! })) },
        },
      });
    }

    const weekStart = toDateColumn(weekStartOf(now));
    await tx.generationQuota.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: { userId, weekStart, used: plan.lettersUsed },
      update: { used: plan.lettersUsed, updatedAt: now },
    });
  });
}

/**
 * Creates or resets one account on the local stack so it holds exactly its plan. Returns null when
 * it does, or a note for the terminal when the account had to be left as it was.
 */
export async function seedAccount(
  account: SeedAccount,
  { email, password, now = new Date() }: SeedOptions,
): Promise<string | null> {
  assertLocalStack(process.env);
  // Planning refuses an impossible account before anything is created or cleared.
  const plan = planAccount(account, todayUtc(now));
  const client = authClient();
  const ensured = await ensureAccount(client, plan, email, password);
  if ("skipped" in ensured) return ensured.skipped;

  const bucket = client.storage.from(DOCUMENTS_BUCKET);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL"), max: 2 }) });
  try {
    await clearTenant(prisma, bucket, ensured.userId);
    await writeTenant(prisma, bucket, ensured.userId, plan, now);
  } finally {
    await prisma.$disconnect();
  }

  // Seeding resets the account to its plan, and the Plan is part of it: an account seeded as free
  // comes off pro too.
  const migrator = new pg.Client({ connectionString: requireEnv("DIRECT_URL") });
  await migrator.connect();
  try {
    await setPlanForUser(migrator, ensured.userId, plan.plan);
  } finally {
    await migrator.end();
  }
  return null;
}
