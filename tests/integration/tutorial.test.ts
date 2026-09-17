import { beforeEach, describe, expect, it } from "vitest";

import { signInAs } from "./session-mock";

import { hasFinishedARun } from "@/server/data/tutorial";
import { withTenant } from "@/server/db/tenant";
import { endPracticeRound, startPracticeRound } from "@/server/interview/practice-round";

import { newUserId, resetTables, setPlan } from "./helpers";

/**
 * Whether a Tenant is new to the Interview Simulator, against the real database (practice feedback ticket
 * 06): the Tutorial is offered until they have finished a Practice round or an Attempt.
 */

beforeEach(async () => {
  await resetTables();
});

const MONDAY = new Date("2026-09-14T00:00:00.000Z");

describe("who is new to the Simulator (practice feedback ticket 06)", () => {
  it("TUI-1: a new Tenant has finished nothing, and an unfinished Practice round doesn't count", async () => {
    signInAs(newUserId());
    expect(await hasFinishedARun()).toBe(false);

    const started = await startPracticeRound({ reset: false });
    if (!started.ok) throw new Error(started.reason);
    expect(await hasFinishedARun()).toBe(false);

    await endPracticeRound(started.round.id, undefined);
    expect(await hasFinishedARun()).toBe(true);
  });

  it("TUI-2: a finished Attempt counts, an unfinished one doesn't, and another Tenant's never does", async () => {
    const userId = newUserId();
    await setPlan(userId, "pro");
    signInAs(userId);
    const job = await withTenant(userId, (tx) =>
      tx.job.create({
        data: { userId, company: "Fernwood", role: "Designer", location: "Remote", addedOn: MONDAY, accent: "moss", description: "A posting." },
      }),
    );
    const attempt = await withTenant(userId, (tx) => tx.attempt.create({ data: { userId, jobId: job.id, length: 15 } }));
    expect(await hasFinishedARun()).toBe(false);

    await withTenant(userId, (tx) => tx.attempt.update({ where: { id: attempt.id }, data: { completedAt: new Date() } }));
    expect(await hasFinishedARun()).toBe(true);

    signInAs(newUserId());
    expect(await hasFinishedARun()).toBe(false);
  });
});
