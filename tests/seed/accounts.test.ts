// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DOCUMENT_CAP } from "@/lib/documents";
import { COVER_LETTER_QUOTA, SHORT_DESCRIPTION_CHARS } from "@/lib/generation";
import { STAGES } from "@/lib/jobs";
import { extractDocumentText } from "@/server/ingest/extract";

import { SEED_ACCOUNTS } from "../../scripts/seed/accounts";
import { planAccount, type PlannedAccount } from "../../scripts/seed/plan";

const TODAY = "2026-09-11";

const planned = (key: string): PlannedAccount => {
  const account = SEED_ACCOUNTS.find((candidate) => candidate.key === key);
  if (!account) throw new Error(`no seed account "${key}"`);
  return planAccount(account, TODAY);
};

const holdings = (account: PlannedAccount) => ({
  documents: account.documents.length,
  contacts: account.contacts.length,
  jobs: account.jobs.length,
  lettersUsed: account.lettersUsed,
});

const descriptionLength = (job: PlannedAccount["jobs"][number]) => job.description.trim().length;

describe("the seeded accounts", () => {
  it("SEED-6: are the four agreed accounts, each plans cleanly, and every document passes extraction as stored", async () => {
    expect(SEED_ACCOUNTS.map((account) => account.key)).toEqual(["new", "searching", "at-limits", "unverified"]);

    for (const account of SEED_ACCOUNTS) {
      for (const document of planAccount(account, TODAY).documents) {
        expect(await extractDocumentText(document.bytes, "pdf"), `${account.key}/${document.key}`).toEqual({
          ok: true,
          text: document.text,
        });
      }
    }
  });

  it("SEED-7: first run — verified, and nothing on file anywhere", () => {
    const account = planned("new");
    expect(account.verified).toBe(true);
    expect(holdings(account)).toEqual({ documents: 0, contacts: 0, jobs: 0, lettersUsed: 0 });
  });

  it("SEED-7: mid-search — every stage, shared contacts, room to upload, letters left, and each cover-letter state", () => {
    const account = planned("searching");
    const jobs = account.jobs;

    expect(new Set(jobs.map((job) => job.stage))).toEqual(new Set(STAGES));

    const links = (key: string) => jobs.filter((job) => job.contacts.includes(key)).length;
    expect(account.contacts.some((contact) => links(contact.key) >= 3), "a contact on three or more jobs").toBe(true);
    expect(account.contacts.some((contact) => links(contact.key) === 0), "a contact on no job").toBe(true);
    expect(account.contacts.some((contact) => contact.agency !== ""), "an agency recruiter").toBe(true);

    expect(account.documents.length).toBeGreaterThan(0);
    expect(account.documents.length).toBeLessThan(DOCUMENT_CAP);
    expect(account.lettersUsed).toBeGreaterThan(0);
    expect(account.lettersUsed).toBeLessThan(COVER_LETTER_QUOTA);

    expect(jobs.some((job) => job.resume && descriptionLength(job) >= SHORT_DESCRIPTION_CHARS), "ready to write").toBe(true);
    expect(
      jobs.some((job) => job.resume && descriptionLength(job) > 0 && descriptionLength(job) < SHORT_DESCRIPTION_CHARS),
      "a short description",
    ).toBe(true);
    expect(jobs.some((job) => !job.resume && descriptionLength(job) > 0), "no resume in the kit").toBe(true);
    expect(jobs.some((job) => job.coverLetter), "a cover letter in a kit").toBe(true);

    const salaries = new Set(
      jobs.map((job) => `${job.salaryMin === null ? "?" : "min"}-${job.salaryMax === null ? "?" : "max"}`),
    );
    expect(salaries).toEqual(new Set(["min-max", "min-?", "?-max", "?-?"]));
  });

  it("SEED-7: at every limit — every document slot and every letter this week used, with a job otherwise ready to write", () => {
    const account = planned("at-limits");
    expect(account.documents).toHaveLength(DOCUMENT_CAP);
    expect(account.lettersUsed).toBe(COVER_LETTER_QUOTA);
    expect(account.jobs.some((job) => job.resume && descriptionLength(job) >= SHORT_DESCRIPTION_CHARS)).toBe(true);
  });

  it("SEED-7: unverified — signed up, never verified, owning nothing", () => {
    const account = planned("unverified");
    expect(account.verified).toBe(false);
    expect(holdings(account)).toEqual({ documents: 0, contacts: 0, jobs: 0, lettersUsed: 0 });
  });
});
