import "server-only";

import { APITimeoutError, RateLimitError, TypeSafeClient, score } from "@typesafe-ai/sdk";

import {
  FOOTING_CRITERIA,
  FOOTING_DIMENSIONS,
  FOOTING_LEVELS,
  normalise,
  type FootingDimension,
  type FootingDimensionScore,
  type FootingFailure,
} from "@/lib/footing";
import { stripInvisible } from "@/lib/invisible";
import { logError } from "@/server/log";

/**
 * The Footing's one TypeSafe call (footing ticket 01), the same shape as the Interview Simulator's
 * Claude calls (`src/server/interview/claude.ts`): server-side only, the key read from the
 * environment here and nowhere else, and the answer validated before anything downstream sees it.
 * `server-only` fails the build if a Client Component reaches this file.
 *
 * **One request, five questions, one shared state.** Jev evaluates them in parallel against the same
 * state, which is why five dimensions cost roughly what one would.
 *
 * The injection surface is smaller than the letter writer's and is treated as real anyway: the
 * `criteria` are fixed by us, the `state` is pure data, there is no generation and there are no
 * tools, so the worst a hostile job description can do is nudge a level. `stripInvisible` is applied
 * on the way in for consistency with everything else that crosses this boundary rather than out of
 * necessity, and a score outside the rubric is a malformed answer rather than a result.
 */

/** The model. Input costs $0.042 per million tokens and output is free, so one Footing is ~$0.0002. */
export const FOOTING_MODEL = "jev-latest";

/** Bounded well inside the route's `maxDuration`, so a handler always answers. */
const DEFAULT_TIMEOUT_MS = 25_000;

export function footingTimeoutMs(): number {
  const configured = Number(process.env.FOOTING_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= DEFAULT_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

/** Whether a key is configured. Says nothing about the key itself. */
export function footingAvailable(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/**
 * Null when no key is configured: the feature is then **unavailable, not broken**, and the job page
 * leaves the control off entirely rather than offering something that cannot work.
 *
 * `TYPESAFE_BASE_URL` is honoured by the SDK itself, which is how the e2e suite points it at a fake.
 * `maxRetries: 0` — nothing retries automatically; a retry is the Tenant's act, and a failure stores
 * nothing, so it costs them nothing either.
 */
export function createFootingClient(): TypeSafeClient | null {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  return new TypeSafeClient({
    apiKey,
    defaultModel: FOOTING_MODEL,
    retry: { maxRetries: 0 },
    timeout: footingTimeoutMs(),
    // The SDK's `debug` level logs request bodies, which here are the Tenant's resume.
    logLevel: "off",
  });
}

/**
 * How much of each text goes into the state, in characters.
 *
 * Jev's state limit is 32k. These three add to 22,000 before the field names, which leaves room for
 * the rubrics and keeps the budget a documented number rather than a limit discovered in production.
 * The resume and the posting get the same allowance because either can be the longer one; the letter
 * gets less because a cover letter that runs past six thousand characters has a bigger problem than
 * its Footing.
 */
export const STATE_BUDGET = { description: 8_000, resume: 8_000, coverLetter: 6_000 } as const;

/** What a Footing is scored from. The extracted text only — Jev is text-only, so the file was never an option. */
export type FootingSources = {
  company: string;
  role: string;
  description: string;
  resumeText: string;
  /** Empty when the Application kit holds no cover letter. `Job.draft` is never scored. */
  coverLetterText: string;
};

export type FootingOutcome =
  | { ok: true; dimensions: FootingDimensionScore[] }
  | { ok: false; reason: FootingFailure };

/** Stripped, trimmed, and cut to its budget: how every text enters the state. */
const clean = (text: string, max: number) => stripInvisible(text).trim().slice(0, max);

/**
 * The state, as pure data rather than a prompt. Nothing here instructs the model; the questions do
 * that, and they are ours.
 */
export function buildState(sources: FootingSources) {
  return {
    posting: {
      company: clean(sources.company, 200),
      role: clean(sources.role, 200),
      description: clean(sources.description, STATE_BUDGET.description),
    },
    resume: clean(sources.resumeText, STATE_BUDGET.resume),
    coverLetter: clean(sources.coverLetterText, STATE_BUDGET.coverLetter),
  };
}

/** What each dimension asks, as the instruction beside its rubric. */
const INSTRUCTIONS: Record<FootingDimension, string> = {
  skills: "How well does the resume show the specific skills, tools and methods the posting names?",
  experience:
    "How well does the depth and seniority of the resume's experience match what the posting asks for?",
  domain: "How well do the industry, product and company context in the resume line up with the posting's?",
  proof_of_work:
    "How much does the resume show work shipped and concluded — outcomes and evidence of doing — rather than titles held?",
  letter: "How well does the cover letter make the case this posting asks for?",
};

/** The questions for one request: the four always, and the letter's only when there is a letter. */
function questionsFor(dimensions: readonly FootingDimension[]) {
  return Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      score(INSTRUCTIONS[dimension], FOOTING_CRITERIA[dimension]),
    ]),
  );
}

/**
 * Which dimensions this Job can actually be scored on. The Letter dimension is left out when the
 * Application kit holds no cover letter: there is nothing to read, and a score for an absent letter
 * would be a number about nothing. It reads the attached **Document** only — never `Job.draft`,
 * because scoring a Draft means a number that moves every time the Tenant presses Rewrite.
 */
export function dimensionsFor(sources: FootingSources): FootingDimension[] {
  const hasLetter = sources.coverLetterText.trim().length > 0;
  return FOOTING_DIMENSIONS.filter((dimension) => dimension !== "letter" || hasLetter);
}

/**
 * One Footing. The answer is validated before anything downstream sees it: every dimension asked for
 * present, each score within the rubric, each confidence within 0–1. Anything else is a malformed
 * answer and not a result — which is what stops a hostile posting from being worth writing.
 */
export async function scoreFooting(
  sources: FootingSources,
  { client, tenant = null }: { client: TypeSafeClient | null; tenant?: string | null },
): Promise<FootingOutcome> {
  if (!client) return { ok: false, reason: "unavailable" };

  const asked = dimensionsFor(sources);
  let answers;
  try {
    const result = await client.systemOne({ state: buildState(sources), questions: questionsFor(asked) });
    answers = result.answers as Record<string, { score?: unknown; confidence?: unknown }>;
  } catch (error) {
    if (error instanceof APITimeoutError) return { ok: false, reason: "timed-out" };
    // **Their** limit, not ours. It is shared across this whole deployment, so it is `busy` rather
    // than `rate-limited` — the Tenant's own daily ceiling is enforced long before we get here, and
    // saying "you've scored a lot of jobs today" for someone else's traffic would be a lie.
    if (error instanceof RateLimitError) return { ok: false, reason: "busy" };
    // Never the state, never the answer: the operation, the tenant, the error's class and message.
    logError({ operation: "footing.score", tenant }, error);
    return { ok: false, reason: "failed" };
  }

  const dimensions: FootingDimensionScore[] = [];
  for (const dimension of asked) {
    const answer = answers[dimension];
    // A dimension that was asked about and did not come back at all: the answer is short of what was
    // requested, which is this provider's version of a truncated one.
    if (!answer) {
      logError(
        { operation: "footing.score.incomplete", tenant, dimension },
        new Error(`no answer for ${dimension}`),
      );
      return { ok: false, reason: "truncated" };
    }
    // Present, but not a position on the rubric we sent. That is a malformed answer rather than a
    // short one, and it is a failure of ours or theirs — never a result.
    const { score: raw, confidence } = answer;
    if (
      typeof raw !== "number" ||
      !Number.isFinite(raw) ||
      raw < 0 ||
      raw > FOOTING_LEVELS - 1 ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      logError(
        { operation: "footing.score.malformed", tenant, dimension },
        new Error(`no usable score for ${dimension}`),
      );
      return { ok: false, reason: "failed" };
    }
    dimensions.push({ dimension, score: normalise(raw), confidence });
  }
  return { ok: true, dimensions };
}
