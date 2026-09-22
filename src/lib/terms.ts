/**
 * The terms, the privacy disclosure, and the version of them an Account has agreed to (`CONTEXT.md`;
 * terms tickets 01–04). Pure: the public pages, the gate, and the data layer all read from here, so
 * the page a Tenant reads and the summary the gate shows can never disagree about what is sent where.
 */

/**
 * Which version of the terms is current. One constant, owning this number the way `PLAN_LIMITS` owns
 * its numbers (**ADR-0008**).
 *
 * **Bumping it re-prompts every Account**, including those that accepted every earlier version: the
 * gate keys off "this session has no acceptance of `TERMS_VERSION`", so there is nothing else to do
 * and no backfill to write. Bump it whenever what is disclosed changes — a third provider, a
 * different retention position, a new thing sent — and leave it alone for a typo.
 *
 * A date rather than a serial, because the privacy page has to be dated anyway (the Anthropic
 * retention figure is a fact about this deployment's configuration, not a permanent truth) and two
 * numbers that must move together are one number.
 */
export const TERMS_VERSION = "2026-09-22";

/** A `YYYY-MM-DD` version as it reads at the foot of the pages. */
export function formatTermsDate(version: string): string {
  return new Date(`${version}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An AI company this product sends a Tenant's text to, and what it commits to in return. */
export type AiProvider = {
  /** The company. Named, never "our AI partner". */
  name: string;
  /** What this product uses them for, in the words the features are known by. */
  usedFor: string;
  /** The text that leaves this product for them. */
  sends: readonly string[];
  /** Their no-training commitment, quoted verbatim rather than paraphrased. */
  quote: string;
  /** Where that quote is from. */
  quoteSource: string;
  /** How long they keep it, stated as specifically as it is actually known. */
  retention: string;
};

/**
 * The two providers, and what each one is told. The commitments are quoted because a paraphrase of a
 * commitment is a disclaimer, and **a disclaimer where a commitment exists is less accurate than the
 * truth** — saying the operator cannot tell whether this data trains AI models would be untrue of
 * both companies.
 *
 * What is genuinely unknown is said as exactly that: TypeSafe publishes no retention period. One
 * unknown, named, rather than a fog over both.
 */
export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    name: "Anthropic",
    usedFor: "Cover letters, interview question sets, and scoring an interview attempt.",
    sends: [
      "the job description you pasted onto the job",
      "the extracted text of the resume in that job’s application kit",
      "the cover letter you asked to be rewritten, and the feedback you gave on it",
      "what you said in an interview attempt, as your browser transcribed it",
    ],
    quote: "Anthropic may not train models on Customer Content from Services.",
    quoteSource: "Anthropic Commercial Terms of Service",
    retention:
      "30 days — the standard retention period for Anthropic’s commercial API, which is how this deployment is configured. Some models carry a 30-day floor that cannot be shortened.",
  },
  {
    name: "TypeSafe",
    usedFor: "Scoring your footing on a job.",
    sends: [
      "the job description you pasted onto the job",
      "the extracted text of the resume in that job’s application kit",
      "the extracted text of the cover letter in that job’s application kit",
    ],
    quote:
      "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input.",
    quoteSource: "TypeSafe privacy policy",
    retention:
      "No period is published. TypeSafe says input is kept “as long as reasonably necessary to provide you with the Services, or otherwise in support of our business or commercial purposes”, and is deleted on request. That is the one thing on this page we do not know a number for.",
  },
] as const;

/**
 * True of both providers, and worth its own line: the files are never sent. Both take text only, so
 * the PDF or DOCX you uploaded stays in the private bucket it was uploaded to.
 */
export const FILES_ARE_NEVER_SENT =
  "The files you upload are never sent to either company. Both read text only, so what leaves this product is the text extracted from a document at upload — never the PDF or Word file itself, which stays in a private bucket only you can read from.";

/** What this product does not do, said plainly, because a privacy page that only lists what is sent is half a page. */
export const WHAT_WE_DO_NOT_DO: readonly string[] = [
  "We do not sell your data, and there is nobody to sell it to.",
  "We do not show advertising, and nothing here is funded by profiling you.",
  "We do not share anything between accounts. There is no row in this product a second person may read — no shared job, no public board.",
  "App feedback you send is emailed to the person who makes this and stored nowhere.",
  "Deleting your account erases everything it owns at once and for good, including every record that you accepted these terms.",
];

/** The short summary the acceptance gate shows, so the gate and the privacy page cannot drift apart. */
export function providerSummary(provider: AiProvider): string {
  return `${provider.name} — ${provider.usedFor.replace(/\.$/, "")}. Neither trains on it.`;
}
