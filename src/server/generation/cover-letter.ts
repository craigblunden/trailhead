import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { VERDICTS, type GenerationFailure, type Verdict } from "@/lib/generation";
import { stripInvisible } from "@/lib/invisible";
import { logError } from "@/server/log";

import { buildCoverLetterPrompt, type CoverLetterInputs } from "./prompt";

/**
 * The one Claude call in the application. Server-side only: the key is read from the environment
 * here and nowhere else, and `server-only` fails the build if a Client Component reaches this file.
 *
 * The answer is structured (feedback issue 03): the letter, a verdict on whether any of the material
 * carried directions to the writer, and whether a Feedback request was set aside for going beyond the
 * resume. All three come from the same call, so no second model call is ever made to decide any of it.
 */

export const COVER_LETTER_MODEL = "claude-sonnet-5";

/** Bounded well inside the route's `maxDuration`, so the handler always answers. */
const DEFAULT_TIMEOUT_MS = 55_000;

export function generationTimeoutMs(): number {
  const configured = Number(process.env.GENERATION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= DEFAULT_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

/** Whether a key is configured. Says nothing about the key itself. */
export function generationAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Null when no key is configured: generation is then unavailable, not broken. `ANTHROPIC_BASE_URL`
 * is honoured by the SDK itself, which is how the test suites point it at a fake.
 *
 * `maxRetries: 0` — nothing retries automatically (ticket 19). A retry is the user's act, and
 * because a failure of ours or Anthropic's gives the reserved letter back, it costs them nothing.
 */
export function createClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, maxRetries: 0, timeout: generationTimeoutMs() });
}

/** The object the writer answers with. The system prompt defines each field; this is its shape. */
export const LETTER_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    letter: { type: "string" },
    verdict: { type: "string", enum: [...VERDICTS] },
    set_aside: { type: "boolean" },
  },
  required: ["letter", "verdict", "set_aside"],
  additionalProperties: false,
} as const;

const letterAnswer = z.object({
  letter: z.string(),
  verdict: z.enum(VERDICTS),
  set_aside: z.boolean(),
});

export type WriteOutcome =
  | { ok: true; letter: string; verdict: Verdict; setAside: boolean }
  | { ok: false; reason: GenerationFailure };

export async function writeCoverLetter(
  inputs: CoverLetterInputs,
  { client = createClaudeClient(), tenant = null }: { client?: Anthropic | null; tenant?: string | null } = {},
): Promise<WriteOutcome> {
  if (!client) return { ok: false, reason: "unavailable" };
  const { system, user } = buildCoverLetterPrompt(inputs);

  let response;
  try {
    response = await client.beta.messages.create({
      model: COVER_LETTER_MODEL,
      max_tokens: 16_000,
      // A letter needs judgement, not deep reasoning; medium effort keeps the wait near the
      // 10–25 seconds the waiting state was designed around.
      thinking: { type: "adaptive" },
      // The structured answer: the letter, the verdict, and whether a request was set aside.
      output_config: { effort: "medium", format: { type: "json_schema", schema: LETTER_OUTPUT_SCHEMA } },
      // If a safety classifier declines, the API re-runs the request on Anthropic's recommended
      // fallback model inside this same call, routed by the refusal's category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "timed-out" };
    // Never the prompt, never the response body: the operation, the tenant, the error's class and message.
    logError({ operation: "generation.claude", tenant }, error);
    return { ok: false, reason: "failed" };
  }

  // A refusal arrives as HTTP 200. Check the stop reason before reading any content, or a refusal
  // renders as an empty (or partial) letter and looks like a bug (ticket 19).
  if (response.stop_reason === "refusal") return { ok: false, reason: "refused" };
  if (response.stop_reason === "max_tokens") return { ok: false, reason: "truncated" };

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  const answer = parseAnswer(text);
  // The letter is plain text: whatever invisible characters the writer might carry into it are
  // stripped, so what the user pastes into their own template holds nothing they cannot see.
  const letter = answer ? stripInvisible(answer.letter).trim() : "";
  if (!answer || !letter) {
    // Malformed, or an empty letter: the stop reason and never the body.
    logError({ operation: "generation.malformed", tenant }, new Error(`stop_reason ${response.stop_reason}`));
    return { ok: false, reason: "failed" };
  }
  return { ok: true, letter, verdict: answer.verdict, setAside: answer.set_aside };
}

function parseAnswer(text: string): z.infer<typeof letterAnswer> | null {
  try {
    const parsed = letterAnswer.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
