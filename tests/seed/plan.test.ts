// @vitest-environment node
import { describe, expect, it } from "vitest";

import { planAccount, type SeedAccount } from "../../scripts/seed/plan";

const TODAY = "2026-09-11";

const account = (overrides: Partial<SeedAccount> = {}): SeedAccount => ({
  key: "test",
  name: "Sam Rivera",
  verified: true,
  ...overrides,
});

describe("a seeded account is one the app could have produced", () => {
  it("SEED-3: a job's stage, dates, accent, and history are what the app writes when the job is added and then moved", () => {
    const planned = planAccount(
      account({
        jobs: [
          {
            company: "Fernwood",
            role: "Product Designer",
            location: "Remote (US)",
            addedDaysAgo: 20,
            moves: [
              { stage: "applied", daysAgo: 15 },
              { stage: "interviewing", daysAgo: 6 },
            ],
          },
          {
            company: "Bramble",
            role: "Senior UX Designer",
            location: "Hybrid · Denver",
            addedDaysAgo: 12,
            moves: [{ stage: "rejected", daysAgo: 3 }],
          },
          { company: "Quill Health", role: "Product Designer", location: "Remote (US)", addedDaysAgo: 2 },
        ],
      }),
      TODAY,
    );

    expect(
      planned.jobs.map(({ stage, addedOn, appliedOn, accent, activity }) => ({
        stage,
        addedOn,
        appliedOn,
        accent,
        activity,
      })),
    ).toEqual([
      {
        stage: "interviewing",
        addedOn: "2026-08-22",
        appliedOn: "2026-08-27",
        accent: "moss",
        activity: [
          { label: "Added to board — Interested", date: "2026-08-22" },
          { label: "Moved to Applied", date: "2026-08-27" },
          { label: "Moved to Interviewing", date: "2026-09-05" },
        ],
      },
      {
        // Leaving Interested with no applied date on file backfills one, as the board does.
        stage: "rejected",
        addedOn: "2026-08-30",
        appliedOn: "2026-09-08",
        accent: "forest",
        activity: [
          { label: "Added to board — Interested", date: "2026-08-30" },
          { label: "Moved to Rejected", date: "2026-09-08" },
        ],
      },
      {
        stage: "interested",
        addedOn: "2026-09-09",
        appliedOn: null,
        accent: "teal",
        activity: [{ label: "Added to board — Interested", date: "2026-09-09" }],
      },
    ]);
  });

  it("SEED-4: documents are real files with their text, contacts keep their details, and jobs link the contacts and kit they name", () => {
    const planned = planAccount(
      account({
        documents: [
          {
            key: "resume",
            kind: "resume",
            fileName: "sam-rivera-resume.pdf",
            lines: ["Sam Rivera - Product Designer", "Austin, TX"],
            uploadedDaysAgo: 30,
          },
          {
            key: "letter",
            kind: "cover_letter",
            fileName: "fernwood-cover-letter.pdf",
            lines: ["Dear Fernwood team,", "I would love to build your referral loop."],
            uploadedDaysAgo: 14,
          },
        ],
        contacts: [
          {
            key: "dana",
            name: "Dana Whitfield",
            kind: "recruiter",
            agency: "Northstar Talent",
            email: "dana@northstar.example.com",
            lastSpokenDaysAgo: 4,
          },
          { key: "ravi", name: "Ravi Menon", kind: "hiring_manager" },
        ],
        jobs: [
          {
            company: "Fernwood",
            role: "Product Designer",
            location: "Remote (US)",
            addedDaysAgo: 20,
            contacts: ["dana", "ravi"],
            resume: "resume",
            coverLetter: "letter",
          },
          { company: "Quill Health", role: "Product Designer", location: "Remote (US)", addedDaysAgo: 2 },
        ],
        lettersUsed: 2,
      }),
      TODAY,
    );

    expect(planned.documents.map(({ bytes, ...rest }) => ({ ...rest, isPdf: Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-" }))).toEqual([
      {
        key: "resume",
        kind: "resume",
        fileName: "sam-rivera-resume.pdf",
        mimeType: "application/pdf",
        uploadedOn: "2026-08-12",
        text: "Sam Rivera - Product Designer\nAustin, TX",
        isPdf: true,
      },
      {
        key: "letter",
        kind: "cover_letter",
        fileName: "fernwood-cover-letter.pdf",
        mimeType: "application/pdf",
        uploadedOn: "2026-08-28",
        text: "Dear Fernwood team,\nI would love to build your referral loop.",
        isPdf: true,
      },
    ]);
    expect(planned.contacts).toEqual([
      {
        key: "dana",
        name: "Dana Whitfield",
        kind: "recruiter",
        title: "",
        agency: "Northstar Talent",
        email: "dana@northstar.example.com",
        phone: "",
        notes: "",
        linkedinUrl: "",
        lastSpokenOn: "2026-09-07",
      },
      {
        key: "ravi",
        name: "Ravi Menon",
        kind: "hiring_manager",
        title: "",
        agency: "",
        email: "",
        phone: "",
        notes: "",
        linkedinUrl: "",
        lastSpokenOn: null,
      },
    ]);
    expect(planned.jobs.map(({ contacts, resume, coverLetter }) => ({ contacts, resume, coverLetter }))).toEqual([
      { contacts: ["dana", "ravi"], resume: "resume", coverLetter: "letter" },
      { contacts: [], resume: null, coverLetter: null },
    ]);
    expect(planned.lettersUsed).toBe(2);
    expect(planAccount(account(), TODAY).lettersUsed).toBe(0);
  });

  it("SEED-4: an account is held to its own Plan's Limits, and the default Plan is free", () => {
    const resume = { kind: "resume", fileName: "resume.pdf", lines: ["Sam Rivera"], uploadedDaysAgo: 5 } as const;
    const four = ["a", "b", "c", "d"].map((key) => ({ ...resume, key }));

    const pro = planAccount(account({ plan: "pro", documents: four, lettersUsed: 7 }), TODAY);
    expect(pro.plan).toBe("pro");
    expect(pro.documents).toHaveLength(4);
    expect(pro.lettersUsed).toBe(7);

    expect(planAccount(account(), TODAY).plan).toBe("free");
    expect(() => planAccount(account({ documents: four }), TODAY)).toThrow(/on free holds at most 3 documents/);
  });

  it("SEED-5: refuses an account the app could never have produced, and says what is wrong", () => {
    const job = { company: "Fernwood", role: "Product Designer", location: "Remote (US)", addedDaysAgo: 10 };
    const resume = {
      key: "resume",
      kind: "resume",
      fileName: "resume.pdf",
      lines: ["Sam Rivera - Product Designer"],
      uploadedDaysAgo: 5,
    } as const;
    const dana = { key: "dana", name: "Dana Whitfield", kind: "recruiter" } as const;

    const refusals: [string, Partial<SeedAccount>, RegExp][] = [
      ["an unknown contact", { jobs: [{ ...job, contacts: ["nobody"] }] }, /contact "nobody"/],
      ["an unknown document", { jobs: [{ ...job, resume: "missing" }] }, /document "missing"/],
      ["a resume sent as a cover letter", { documents: [resume], jobs: [{ ...job, coverLetter: "resume" }] }, /cover letter/],
      [
        "more documents than the cap",
        { documents: ["a", "b", "c", "d"].map((key) => ({ ...resume, key })) },
        /at most 3 documents/,
      ],
      ["a key used twice", { contacts: [dana, dana] }, /"dana" twice/],
      ["a document the app would not accept", { documents: [{ ...resume, fileName: "resume.docx" }] }, /\.pdf/],
      ["a file name longer than an upload allows", { documents: [{ ...resume, fileName: `${"r".repeat(252)}.pdf` }] }, /fileName/],
      ["more letters than the quota", { lettersUsed: 6 }, /on free holds at most 5 cover letters/],
      ["more letters than basic's week", { plan: "basic", lettersUsed: 16 }, /on basic holds at most 15 cover letters/],
      ["more letters than pro's week", { plan: "pro", lettersUsed: 26 }, /on pro holds at most 25 cover letters/],
      ["a move to the stage it is in", { jobs: [{ ...job, moves: [{ stage: "interested", daysAgo: 5 }] }] }, /already/],
      ["a move before it was added", { jobs: [{ ...job, moves: [{ stage: "applied", daysAgo: 12 }] }] }, /before/],
      [
        "moves out of order",
        {
          jobs: [
            {
              ...job,
              moves: [
                { stage: "applied", daysAgo: 5 },
                { stage: "interviewing", daysAgo: 7 },
              ],
            },
          ],
        },
        /before/,
      ],
      ["a date in the future", { jobs: [{ ...job, addedDaysAgo: -1 }] }, /future/],
      ["a job field validation refuses", { jobs: [{ ...job, postingUrl: "javascript:alert(1)" }] }, /postingUrl/],
      ["a contact field validation refuses", { contacts: [{ ...dana, email: "not-an-email" }] }, /email/],
      ["data on an account that never signed in", { verified: false, jobs: [job] }, /unverified/],
    ];

    for (const [why, overrides, message] of refusals) {
      expect(() => planAccount(account(overrides), TODAY), why).toThrow(message);
    }
  });
});
