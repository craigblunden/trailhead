import { afterAll, describe, expect, it } from "vitest";

import { signOut } from "./session-mock";

import { todayUtc } from "@/lib/dates";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { listContacts } from "@/server/data/contacts";
import { documentDownloadUrl, listDocuments } from "@/server/data/documents";
import { generationQuota } from "@/server/data/generation";
import { createJob, listJobs } from "@/server/data/jobs";

import { uniqueEmail, waitForMail } from "../../e2e/mail";
import { planAccount, type SeedAccount } from "../../scripts/seed/plan";
import { seedAccount } from "../../scripts/seed/seed";

import { PASSWORD, authClient, passwordSignIn } from "./social-helpers";
import { actAs, emptyFolder, type RealUser } from "./storage-helpers";

/**
 * `npm run db:seed` against the real local stack (Auth, Mailpit, Postgres under RLS, Storage), read
 * back through the real data layer as the seeded user. What each shipped account contains is pinned
 * in `tests/seed/`; this proves that whatever an account plans to is what the app then shows.
 */

const ACCOUNT: SeedAccount = {
  key: "integration",
  name: "Sam Rivera",
  verified: true,
  documents: [
    {
      key: "resume",
      kind: "resume",
      fileName: "sam-rivera-resume.pdf",
      lines: ["Sam Rivera - Senior Product Designer", "Eight years designing analytics and onboarding for B2B software."],
      uploadedDaysAgo: 9,
    },
    {
      key: "letter",
      kind: "cover_letter",
      fileName: "harvest-cover-letter.pdf",
      lines: ["Dear Harvest & Co team,", "I would love to lead design for your merchant experience."],
      uploadedDaysAgo: 4,
    },
  ],
  contacts: [
    { key: "dana", name: "Dana Whitfield", kind: "recruiter", agency: "Northstar Talent", lastSpokenDaysAgo: 2 },
    { key: "ravi", name: "Ravi Menon", kind: "hiring_manager" },
  ],
  jobs: [
    {
      company: "Harvest & Co",
      role: "Lead Product Designer",
      location: "Onsite · Chicago",
      salaryMin: 140,
      salaryMax: 165,
      description: "Harvest & Co is hiring a Lead Product Designer for the merchant experience.",
      addedDaysAgo: 20,
      moves: [
        { stage: "applied", daysAgo: 16 },
        { stage: "interviewing", daysAgo: 6 },
      ],
      contacts: ["dana", "ravi"],
      resume: "resume",
      coverLetter: "letter",
    },
    { company: "Fernwood", role: "Product Designer", location: "Remote (US)", addedDaysAgo: 3, contacts: ["dana"] },
  ],
  lettersUsed: 3,
};

const seeded: RealUser[] = [];

async function signInTo(email: string): Promise<RealUser> {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const user = { userId: data.user.id, email, client };
  actAs(user);
  seeded.push(user);
  return user;
}

/** Everything the board, contacts, documents, and cover-letter card read, as the signed-in user. */
async function whatTheAppShows() {
  const [jobs, contacts, documents, quota] = await Promise.all([
    listJobs(),
    listContacts(),
    listDocuments(),
    generationQuota(),
  ]);
  return {
    jobs: jobs.map((job) => ({
      company: job.company,
      stage: job.stage,
      salary: [job.salaryMin, job.salaryMax],
      addedOn: job.addedOn,
      appliedOn: job.appliedOn,
      accent: job.accent,
      activity: job.activity.map(({ label, date }) => ({ label, date })),
      contacts: job.contacts.map((contact) => `${contact.name} (also on ${contact.otherJobCount})`),
      resume: job.resume?.fileName ?? null,
      coverLetter: job.coverLetter?.fileName ?? null,
    })),
    contacts: contacts.map(({ name, kind, agency, jobCount }) => ({ name, kind, agency, jobCount })),
    documents: documents.map(({ fileName, kind, status, uploadedOn, jobs: attachedTo }) => ({
      fileName,
      kind,
      status,
      uploadedOn,
      jobs: attachedTo.map((job) => job.company),
    })),
    lettersUsed: quota.used,
  };
}

afterAll(async () => {
  for (const user of seeded) await emptyFolder(user);
  signOut();
});

describe("npm run db:seed", () => {
  it("SEED-8: a seeded account signs in and the app shows exactly what it planned — history, contacts, kit, files, quota", async () => {
    const email = uniqueEmail("seed");
    const plan = planAccount(ACCOUNT, todayUtc());

    await seedAccount(ACCOUNT, { email, password: PASSWORD });
    await signInTo(email);
    const shown = await whatTheAppShows();

    const [harvest, fernwood] = plan.jobs;
    const [resume, letter] = plan.documents;
    expect(shown).toEqual({
      jobs: [
        {
          company: "Harvest & Co",
          stage: "interviewing",
          salary: [140, 165],
          addedOn: harvest.addedOn,
          appliedOn: harvest.appliedOn,
          accent: "moss",
          activity: [...harvest.activity].reverse(),
          contacts: ["Dana Whitfield (also on 1)", "Ravi Menon (also on 0)"],
          resume: "sam-rivera-resume.pdf",
          coverLetter: "harvest-cover-letter.pdf",
        },
        {
          company: "Fernwood",
          stage: "interested",
          salary: [null, null],
          addedOn: fernwood.addedOn,
          appliedOn: null,
          accent: "forest",
          activity: fernwood.activity,
          contacts: ["Dana Whitfield (also on 1)"],
          resume: null,
          coverLetter: null,
        },
      ],
      contacts: [
        { name: "Dana Whitfield", kind: "recruiter", agency: "Northstar Talent", jobCount: 2 },
        { name: "Ravi Menon", kind: "hiring_manager", agency: "", jobCount: 1 },
      ],
      documents: [
        {
          fileName: "harvest-cover-letter.pdf",
          kind: "cover_letter",
          status: "ready",
          uploadedOn: letter.uploadedOn,
          jobs: ["Harvest & Co"],
        },
        {
          fileName: "sam-rivera-resume.pdf",
          kind: "resume",
          status: "ready",
          uploadedOn: resume.uploadedOn,
          jobs: ["Harvest & Co"],
        },
      ],
      lettersUsed: 3,
    });

    // The file is really in Storage, under the user's own policies, and is the PDF that was planned.
    const [newest] = await listDocuments();
    const download = await fetch(await documentDownloadUrl(newest.id));
    expect(download.ok).toBe(true);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(letter.bytes);
  }, 90_000);

  it("SEED-9: seeding again resets the account to its plan — no duplicates, no leftover files, nothing added since", async () => {
    const email = uniqueEmail("seed");
    await seedAccount(ACCOUNT, { email, password: PASSWORD });
    const user = await signInTo(email);
    const first = await whatTheAppShows();

    await createJob({
      company: "Added by hand",
      role: "Product Designer",
      location: "Remote (US)",
      salaryMin: null,
      salaryMax: null,
      postingUrl: "",
      description: "",
    });

    await seedAccount(ACCOUNT, { email, password: PASSWORD });
    const again = await signInTo(email);
    expect(again.userId).toBe(user.userId);
    expect(await whatTheAppShows()).toEqual(first);

    const { data: objects } = await again.client.storage.from(DOCUMENTS_BUCKET).list(again.userId);
    expect(objects).toHaveLength(ACCOUNT.documents!.length);
  }, 120_000);

  it("SEED-10: an unverified account stays unverified when seeded again; once someone verifies it, seeding leaves it and says so", async () => {
    const email = uniqueEmail("seed");
    const account: SeedAccount = { key: "unverified", name: "Casey Quinn", verified: false };

    await expect(seedAccount(account, { email, password: PASSWORD })).resolves.toBeNull();
    await expect(seedAccount(account, { email, password: PASSWORD })).resolves.toBeNull();
    expect((await passwordSignIn(email)).error?.message).toMatch(/not confirmed/i);

    // The flow this account exists for: resend the link, follow it.
    const client = authClient();
    const sentAfter = Date.now() - 2_000;
    await client.auth.resend({ type: "signup", email });
    const mail = await waitForMail(email, /confirm/i, { after: sentAfter });
    const link = new URL(mail.links.find((href) => href.includes("token_hash"))!);
    const verified = await client.auth.verifyOtp({ type: "signup", token_hash: link.searchParams.get("token_hash")! });
    expect(verified.error).toBeNull();

    // Auth has no public way to un-verify, so the run carries on with a note instead of failing.
    await expect(seedAccount(account, { email, password: PASSWORD })).resolves.toMatch(/already verified/);
    expect((await passwordSignIn(email)).error).toBeNull();
  }, 90_000);

  it("SEED-11: refuses an existing account whose password is no longer the seed's, rather than guessing", async () => {
    const email = uniqueEmail("seed");
    const account: SeedAccount = { key: "new", name: "Riley Park", verified: true };
    await seedAccount(account, { email, password: PASSWORD });

    await expect(seedAccount(account, { email, password: "a-different-password" })).rejects.toThrow(
      /password/i,
    );
  }, 60_000);
});
