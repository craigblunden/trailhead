import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { GenerationFailure } from "@/lib/generation";
import { logError } from "@/server/log";

import { buildCoverLetterPrompt, type CoverLetterInputs } from "./prompt";

/**
 * The one Claude call in the application. Server-side only: the key is read from the environment
 * here and nowhere else, and `server-only` fails the build if a Client Component reaches this file.
 */

export const COVER_LETTER_MODEL = "claude-opus-5";

/** Bounded well inside the route's `maxDuration`, so the handler always answers. */
const DEFAULT_TIMEOUT_MS = 55_000;

export function generationTimeoutMs(): number {
  const configured = Number(process.env.GENERATION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= DEFAULT_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

/**
 * Null when no key is configured: generation is then unavailable, not broken. `ANTHROPIC_BASE_URL`
 * is honoured by the SDK itself, which is how the test suites point it at a fake.
 *
 * `maxRetries: 0` — nothing retries automatically (ticket 19). A retry is the user's act, and
 * because a failure gives the reserved letter back, it costs them nothing.
 */
/** Whether a key is configured. Says nothing about the key itself. */
export function generationAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function createClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, maxRetries: 0, timeout: generationTimeoutMs() });
}

export type WriteOutcome = { ok: true; letter: string } | { ok: false; reason: GenerationFailure };

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
      output_config: { effort: "medium" },
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

  const letter = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!letter) {
    logError({ operation: "generation.emptyLetter", tenant }, new Error(`stop_reason ${response.stop_reason}`));
    return { ok: false, reason: "failed" };
  }
  return { ok: true, letter };
}
