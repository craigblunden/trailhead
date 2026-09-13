import { describe, expect, it } from "vitest";

import type { Job } from "@/lib/jobs";
import {
  OPENING_ACTIVITY_LABEL,
  movedJob,
  newJob,
  newJobFacts,
  nextAccent,
  stageChange,
} from "@/lib/jobs-rules";
import { SEED_JOBS } from "../fixtures/jobs";

/**
 * The Job rules, tested directly (architecture ticket 02). The data layer, the board's optimistic
 * update, and the in-memory test store all take a new Job and a Stage move from these.
 */

const TODAY = "2026-07-25";

/** Ids in the order a store asks for them. */
function sequence() {
  let n = 0;
  return () => `id-${++n}`;
}

const fields = {
  company: "Alpine Robotics",
  role: "Principal Designer",
  location: "Remote (US)",
  salaryMin: 160,
  salaryMax: 190,
  postingUrl: "",
  description: "Robots, mostly.",
};

const lead: Job = { ...SEED_JOBS[0], stage: "interested", appliedOn: null };

describe("a new Job", () => {
  it("RULE-1: starts interested, dated today, with no applied date, notes, kit, or contacts, and one opening entry", () => {
    expect(newJob(fields, { today: TODAY, existingCount: 0, newId: sequence() })).toEqual({
      ...fields,
      id: "id-1",
      stage: "interested",
      addedOn: TODAY,
      appliedOn: null,
      notes: "",
      resume: null,
      coverLetter: null,
      draft: "",
      draftWrittenAt: null,
      contacts: [],
      accent: nextAccent(0),
      activity: [{ id: "id-2", label: OPENING_ACTIVITY_LABEL, date: TODAY }],
    });
  });

  it("RULE-2: takes its accent round-robin from how many Jobs came before it", () => {
    const accents = [0, 1, 2, 3, 4, 5, 6].map((count) => newJobFacts(TODAY, count).accent);

    expect(new Set(accents.slice(0, 6)).size).toBe(6);
    expect(accents[6]).toBe(accents[0]);
  });

  it("RULE-3: the facts the data layer writes are the ones the whole Job is built from", () => {
    const { opening, ...facts } = newJobFacts(TODAY, 3);
    const job = newJob(fields, { today: TODAY, existingCount: 3, newId: sequence() });

    expect(job).toMatchObject(facts);
    expect(job.activity).toEqual([{ id: expect.any(String), ...opening }]);
  });
});

describe("moving a Job", () => {
  it("RULE-4: re-selecting the current Stage changes nothing", () => {
    expect(stageChange(lead, "interested", TODAY)).toEqual({ stage: "interested", appliedOn: null, entry: null });
    expect(movedJob(lead, "interested", TODAY, sequence())).toBe(lead);
  });

  it("RULE-5: leaving interested with no applied date backfills today", () => {
    const moved = movedJob(lead, "applied", TODAY, sequence());

    expect(moved.stage).toBe("applied");
    expect(moved.appliedOn).toBe(TODAY);
  });

  it("RULE-6: moving to interested never sets an applied date", () => {
    const moved = movedJob({ ...lead, stage: "applied", appliedOn: null }, "interested", TODAY, sequence());

    expect(moved.stage).toBe("interested");
    expect(moved.appliedOn).toBeNull();
  });

  it("RULE-7: an existing applied date is never touched", () => {
    const applied: Job = { ...lead, stage: "applied", appliedOn: "2026-07-01" };

    expect(movedJob(applied, "offer", TODAY, sequence()).appliedOn).toBe("2026-07-01");
    expect(movedJob(applied, "interested", TODAY, sequence()).appliedOn).toBe("2026-07-01");
  });

  it("RULE-8: a move prepends 'Moved to …' dated today, and leaves the rest of the Job alone", () => {
    const moved = movedJob(lead, "interviewing", TODAY, sequence());

    expect(moved.activity).toEqual([{ id: "id-1", label: "Moved to Interviewing", date: TODAY }, ...lead.activity]);
    expect({ ...moved, stage: lead.stage, appliedOn: lead.appliedOn, activity: lead.activity }).toEqual(lead);
  });
});
