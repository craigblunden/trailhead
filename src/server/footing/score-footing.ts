import "server-only";

import type { TypeSafeClient } from "@typesafe-ai/sdk";

import type { Footing, FootingFailure } from "@/lib/footing";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  FOOTING_DAILY_CEILING,
  footingSources,
  footingsToday,
  previousFooting,
  storeFooting,
} from "@/server/data/footing";
import { logError, logEvent } from "@/server/log";

import { scoreFooting } from "./typesafe";

/**
 * Scoring one Job's Footing (footing ticket 03) — the Tenant's act, never automatic. One call, one
 * outcome, in an order no caller can get wrong:
 *
 * 1. **Unavailable before anything is read.** No key means no Footing, and says so.
 * 2. **No Plan check at all.** A Footing is on every Plan and is not a Limit (**ADR-0007**); there is
 *    deliberately nothing here that reads one.
 * 3. **The readiness guard**, in `readinessOf()`'s own vocabulary, before anything is spent. A Job
 *    with no resume or no description cannot produce a Footing worth having.
 * 4. **The daily ceiling**, a circuit breaker rather than an entitlement: refused plainly, logged, and
 *    never explained to the Tenant as a quota, because it is not one.
 * 5. **The call**, outside any transaction, and its dimensions stored with the stamp of what it saw.
 * 6. **A failure stores nothing.** There is no reservation to give back, because nothing was taken:
 *    the cost of a Footing is a fraction of a cent and the Tenant is charged nothing for a retry.
 *
 * It throws only `UnauthenticatedError` and `NotFoundError`, which a caller answers as 401 and 404.
 * Everything else is an outcome.
 */

export type ScoreOutcome =
  | { ok: true; footing: Footing; previous: Footing | null }
  | {
      ok: false;
      reason: FootingFailure;
      /** The failure was this application's own error, not an answer from the provider. */
      unexpected?: true;
    };

/** The refusals this path can reach before the provider is called at all. */
const BEFORE_CALLING: readonly FootingFailure[] = ["no-resume", "no-description"];

export async function footingScore(
  jobId: string,
  { client, now = new Date() }: { client: TypeSafeClient | null; now?: Date },
): Promise<ScoreOutcome> {
  const { userId: tenant } = await requireSession();
  if (!client) return { ok: false, reason: "unavailable" };

  try {
    const { sources, stamp } = await footingSources(jobId);

    const today = await footingsToday(now);
    if (today >= FOOTING_DAILY_CEILING) {
      // Logged, because a Tenant reaching this is either a bug of ours or worth knowing about; the
      // answer they get is a plain refusal with no quota, no reset day, and nothing to upgrade to.
      logEvent({ operation: "footing.ceiling", tenant, scoredToday: today });
      return { ok: false, reason: "rate-limited" };
    }

    // The call, outside any transaction.
    const outcome = await scoreFooting(sources, { client, tenant });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // What was there before this one, read after the call so the comparison sentence needs no
    // second request — and read before the insert would have made this Footing its own predecessor.
    const previous = await previousFooting(jobId);
    const footing = await storeFooting(jobId, stamp, outcome.dimensions, now);
    return { ok: true, footing, previous };
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof NotFoundError) throw error;
    const refusal = error instanceof RuleError ? BEFORE_CALLING.find((code) => code === error.code) : undefined;
    if (refusal) return { ok: false, reason: refusal };

    logError({ operation: "footing.score", tenant }, error);
    return { ok: false, reason: "failed", unexpected: true };
  }
}

/** The status each failure means, in HTTP. A handler that forgets one fails the typecheck. */
export const FOOTING_STATUS: Record<FootingFailure, number> = {
  unavailable: 503,
  "no-resume": 409,
  "no-description": 409,
  "rate-limited": 429,
  busy: 503,
  "timed-out": 504,
  truncated: 502,
  failed: 502,
};
