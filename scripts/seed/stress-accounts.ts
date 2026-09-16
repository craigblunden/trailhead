import { faker } from "@faker-js/faker";

import { CONTACT_KINDS, type ContactKind } from "@/lib/contacts";
import type { Stage } from "@/lib/jobs";

import type { SeedAccount, SeedContact, SeedDocument, SeedJob } from "./plan";

/**
 * One large pro account for pressure-testing the UI at scale: about fifty randomized jobs, more
 * contacts than any hand-written seed account, and a few documents. `npm run db:seed:stress`
 * builds it and seeds it on its own — never added to `SEED_ACCOUNTS`, which
 * `tests/seed/accounts.test.ts` pins to exactly six agreed accounts.
 *
 * Faker is seeded, so the board looks the same after every run: same jobs, same stages, same
 * contacts. Every value still passes through `planAccount`'s validation, same as a hand-written
 * account.
 */

const FAKER_SEED = 1337;
const JOB_COUNT = 50;
const CONTACT_COUNT = 15;
const LETTERS_USED = 14;

type ChainStage = Exclude<Stage, "interested">;

/** Plausible sequences a job moves through after `interested`, the stage every job starts at. */
const CHAINS: readonly ChainStage[][] = [
  [],
  ["applied"],
  ["applied", "interviewing"],
  ["applied", "interviewing", "offer"],
  ["applied", "interviewing", "rejected"],
  ["applied", "rejected"],
];

function pickChain(): ChainStage[] {
  return faker.helpers.weightedArrayElement([
    { weight: 3, value: CHAINS[0] },
    { weight: 4, value: CHAINS[1] },
    { weight: 3, value: CHAINS[2] },
    { weight: 2, value: CHAINS[3] },
    { weight: 3, value: CHAINS[4] },
    { weight: 2, value: CHAINS[5] },
  ]) as ChainStage[];
}

/** `chain.length` distinct days, oldest first, all before `addedDaysAgo` — a valid move history. */
function movesFor(chain: readonly ChainStage[], addedDaysAgo: number): { stage: Stage; daysAgo: number }[] {
  if (chain.length === 0) return [];
  const days = new Set<number>();
  while (days.size < chain.length) {
    days.add(faker.number.int({ min: 0, max: addedDaysAgo - 1 }));
  }
  const sorted = [...days].sort((a, b) => b - a);
  return chain.map((stage, index) => ({ stage, daysAgo: sorted[index] }));
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Digits, spaces, `+`, `(`, `)`, `.`, `-` only — the shape `contactPhone` requires. */
function fakePhone(): string {
  return `+61 4${faker.number.int({ min: 10_000_000, max: 99_999_999 })}`;
}

function fakeLocation(): string {
  const style = faker.helpers.arrayElement(["remote", "hybrid", "onsite"] as const);
  if (style === "remote") return "Remote (AU)";
  const city = faker.location.city();
  return style === "hybrid" ? `Hybrid · ${city}` : `Onsite · ${city}`;
}

function fakeSalary(): { salaryMin?: number; salaryMax?: number } {
  const min = faker.number.int({ min: 90, max: 200 });
  const max = min + faker.number.int({ min: 10, max: 60 });
  return faker.helpers.arrayElement([{}, { salaryMin: min }, { salaryMax: max }, { salaryMin: min, salaryMax: max }]);
}

function fakeDescription(): string {
  const roll = faker.number.int({ min: 0, max: 9 });
  if (roll === 0) return "";
  if (roll <= 2) return faker.lorem.sentence(20);
  return faker.lorem.paragraphs(faker.number.int({ min: 2, max: 4 }), "\n\n");
}

/** Printable ASCII, at most 90 characters — what a seed PDF's lines must be (`scripts/seed/pdf.ts`). */
function pdfLine(text: string, max = 90): string {
  return text.replace(/[^\x20-\x7e]/g, "").slice(0, max);
}

function resumeLines(name: string, role: string, email: string): string[] {
  return [
    pdfLine(`${name} - ${role}`),
    pdfLine(email),
    "SUMMARY",
    pdfLine(faker.lorem.sentence(16)),
    pdfLine(faker.lorem.sentence(14)),
    "EXPERIENCE",
    pdfLine(`${faker.company.name()} - ${role} - ${faker.number.int({ min: 2018, max: 2023 })} to present`),
    pdfLine(`- ${faker.lorem.sentence(12)}`),
    pdfLine(`- ${faker.lorem.sentence(12)}`),
    pdfLine(`${faker.company.name()} - ${role} - 2016 to 2018`),
    pdfLine(`- ${faker.lorem.sentence(12)}`),
    "SKILLS",
    pdfLine(faker.lorem.words(10)),
  ];
}

function coverLetterLines(name: string, email: string): string[] {
  return [
    pdfLine(`${name} | ${email}`),
    "Hello,",
    pdfLine(faker.lorem.sentence(18)),
    pdfLine(faker.lorem.sentence(16)),
    pdfLine(faker.lorem.sentence(14)),
    "Best,",
    pdfLine(name),
  ];
}

function buildContacts(): SeedContact[] {
  return Array.from({ length: CONTACT_COUNT }, (_, index) => {
    const kind = faker.helpers.arrayElement(CONTACT_KINDS) as ContactKind;
    const name = faker.person.fullName();
    const hasAgency = kind === "recruiter" && faker.datatype.boolean(0.6);
    return {
      key: `contact-${index}`,
      name,
      kind,
      title: faker.person.jobTitle(),
      agency: hasAgency ? faker.company.name() : undefined,
      email: faker.datatype.boolean(0.8) ? faker.internet.exampleEmail() : undefined,
      phone: faker.datatype.boolean(0.7) ? fakePhone() : undefined,
      linkedinUrl: faker.datatype.boolean(0.5) ? `https://www.linkedin.com/in/${slug(name)}-example` : undefined,
      notes: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : undefined,
      lastSpokenDaysAgo: faker.datatype.boolean(0.6) ? faker.number.int({ min: 0, max: 60 }) : null,
    };
  });
}

function buildDocuments(name: string, email: string): SeedDocument[] {
  return [
    {
      key: "resume-general",
      kind: "resume",
      fileName: "stress-resume-general.pdf",
      lines: resumeLines(name, "Product Designer", email),
      uploadedDaysAgo: 60,
    },
    {
      key: "resume-alt",
      kind: "resume",
      fileName: "stress-resume-senior.pdf",
      lines: resumeLines(name, "Senior Product Designer", email),
      uploadedDaysAgo: 35,
    },
    {
      key: "letter-general",
      kind: "cover_letter",
      fileName: "stress-cover-letter-general.pdf",
      lines: coverLetterLines(name, email),
      uploadedDaysAgo: 30,
    },
    {
      key: "letter-alt",
      kind: "cover_letter",
      fileName: "stress-cover-letter-alt.pdf",
      lines: coverLetterLines(name, email),
      uploadedDaysAgo: 12,
    },
  ];
}

function buildJobs(
  name: string,
  documents: { resumes: readonly string[]; letters: readonly string[] },
  contactKeys: readonly string[],
): SeedJob[] {
  return Array.from({ length: JOB_COUNT }, () => {
    const company = faker.company.name();
    const role = faker.person.jobTitle();
    // Comfortably more than the longest chain (3), so `movesFor` always has enough distinct days.
    const addedDaysAgo = faker.number.int({ min: 20, max: 180 });
    const chain = pickChain();
    const moves = movesFor(chain, addedDaysAgo);
    const lastDaysAgo = moves.length > 0 ? moves[moves.length - 1].daysAgo : addedDaysAgo;

    const resume = faker.datatype.boolean(0.7) ? faker.helpers.arrayElement(documents.resumes) : undefined;
    const coverLetter =
      resume && faker.datatype.boolean(0.4) ? faker.helpers.arrayElement(documents.letters) : undefined;
    const draft =
      resume && moves.length > 0 && faker.datatype.boolean(0.25)
        ? {
            paragraphs: [
              "Dear Hiring Manager,",
              faker.lorem.paragraph(),
              faker.lorem.paragraph(),
              `Sincerely,\n${name}`,
            ],
            daysAgo: faker.number.int({ min: 0, max: lastDaysAgo }),
          }
        : undefined;

    return {
      company,
      role,
      location: fakeLocation(),
      ...fakeSalary(),
      postingUrl: `https://${slug(company)}.example.com/jobs/${slug(role)}`,
      description: fakeDescription(),
      notes: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : undefined,
      addedDaysAgo,
      moves,
      contacts: faker.helpers.arrayElements(contactKeys, { min: 0, max: 2 }),
      resume,
      coverLetter,
      draft,
    };
  });
}

export function buildStressAccount(): SeedAccount {
  faker.seed(FAKER_SEED);
  const name = faker.person.fullName();
  const email = faker.internet.exampleEmail();
  const contacts = buildContacts();
  const documents = buildDocuments(name, email);
  const jobs = buildJobs(
    name,
    {
      resumes: documents.filter((document) => document.kind === "resume").map((document) => document.key),
      letters: documents.filter((document) => document.kind === "cover_letter").map((document) => document.key),
    },
    contacts.map((contact) => contact.key),
  );

  return {
    key: "stress",
    name,
    verified: true,
    plan: "pro",
    about:
      `Stress test: ${JOB_COUNT} randomized jobs across every stage, ${CONTACT_COUNT} contacts, and ` +
      `${documents.length} documents, to check the board, lists, and detail pages at scale.`,
    documents,
    contacts,
    jobs,
    lettersUsed: LETTERS_USED,
  };
}
