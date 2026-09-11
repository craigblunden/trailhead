import { describe, expect, it } from "vitest";

import {
  ACTIVE_STAGES,
  STAGES,
  STAGE_META,
  formatLongDate,
  formatSalary,
  formatShortDate,
  initials,
  pluralize,
  timelineLabel,
  webLink,
  type Job,
} from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";

function jobWith(patch: Partial<Job>): Job {
  return { ...SEED_JOBS[0], ...patch };
}

describe("stage model", () => {
  it("DATA-1: lists the five stages in pipeline order", () => {
    expect(STAGES).toEqual([
      "interested",
      "applied",
      "interviewing",
      "offer",
      "rejected",
    ]);
  });

  it("DATA-1: gives every stage a display label and a dot colour", () => {
    for (const stage of STAGES) {
      expect(STAGE_META[stage].label).toBeTruthy();
      expect(STAGE_META[stage].dot).toMatch(/^var\(--stage-/);
    }
  });

  it("DATA-2: treats every stage except rejected as active", () => {
    expect(ACTIVE_STAGES).toEqual(STAGES.filter((s) => s !== "rejected"));
    expect(ACTIVE_STAGES).not.toContain("rejected");
  });
});

describe("formatSalary", () => {
  it("DATA-3: reports an unknown band as TBD", () => {
    expect(formatSalary({ salaryMin: null, salaryMax: null })).toBe("Salary TBD");
  });

  it("DATA-4: reports an open lower bound as a ceiling", () => {
    expect(formatSalary({ salaryMin: null, salaryMax: 150 })).toBe("Up to $150k");
  });

  it("DATA-4: reports an open upper bound as a floor", () => {
    expect(formatSalary({ salaryMin: 120, salaryMax: null })).toBe("From $120k");
  });

  it("DATA-5: joins a complete band with an en dash", () => {
    expect(formatSalary({ salaryMin: 150, salaryMax: 180 })).toBe("$150k–$180k");
  });

  it("DATA-5: handles a band whose bounds are equal", () => {
    expect(formatSalary({ salaryMin: 140, salaryMax: 140 })).toBe("$140k–$140k");
  });

  it("DATA-3: treats zero as a real bound, not as missing", () => {
    expect(formatSalary({ salaryMin: 0, salaryMax: 90 })).toBe("$0k–$90k");
  });
});

describe("date formatting", () => {
  it("DATA-6: formats a short date as month and day", () => {
    expect(formatShortDate("2026-07-22")).toBe("Jul 22");
  });

  it("DATA-6: formats a long date with the full month and year", () => {
    expect(formatLongDate("2026-06-30")).toBe("June 30, 2026");
  });

  it("DATA-6: formats in UTC, so a date never shifts by a day", () => {
    // 1 Jan in UTC is still 31 Dec in any negative-offset local zone. Reading
    // the plain date string as UTC is what keeps SSR and hydration identical.
    expect(formatShortDate("2026-01-01")).toBe("Jan 1");
    expect(formatLongDate("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("timelineLabel", () => {
  it("DATA-7: prefers the applied date when the job has been applied to", () => {
    expect(
      timelineLabel(jobWith({ appliedOn: "2026-07-15", addedOn: "2026-07-11" })),
    ).toBe("Applied Jul 15");
  });

  it("DATA-7: falls back to the added date for a job that is only a lead", () => {
    expect(timelineLabel(jobWith({ appliedOn: null, addedOn: "2026-07-22" }))).toBe(
      "Added Jul 22",
    );
  });
});

describe("initials", () => {
  it("DATA-8: takes the first letter of the company", () => {
    expect(initials("Meridian Labs")).toBe("M");
  });

  it("DATA-8: uppercases and ignores surrounding whitespace", () => {
    expect(initials("  fernwood ")).toBe("F");
  });
});

describe("pluralize", () => {
  it("DATA-9: uses the singular for exactly one", () => {
    expect(pluralize(1, "application")).toBe("1 application");
  });

  it("DATA-9: uses the plural for zero and for many", () => {
    expect(pluralize(0, "application")).toBe("0 applications");
    expect(pluralize(6, "active application")).toBe("6 active applications");
  });
});

describe("webLink", () => {
  it("DATA-10: passes ordinary http and https links through", () => {
    expect(webLink("https://example.com/jobs/1")).toBe("https://example.com/jobs/1");
    expect(webLink("http://example.com")).toBe("http://example.com");
  });

  it("DATA-10: rejects a javascript: URL, which type=url validation accepts", () => {
    expect(webLink("javascript:alert(document.domain)")).toBeNull();
  });

  it("DATA-10: rejects data: and other non-web schemes", () => {
    expect(webLink("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webLink("file:///etc/passwd")).toBeNull();
  });

  it("DATA-10: treats blank and unparseable input as no link", () => {
    expect(webLink("")).toBeNull();
    expect(webLink("not a url")).toBeNull();
  });
});

describe("seed fixtures", () => {
  it("give every job a unique id", () => {
    const ids = SEED_JOBS.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only use stages the board knows how to render", () => {
    for (const job of SEED_JOBS) {
      expect(STAGES).toContain(job.stage);
    }
  });

  it("never claim an applied date without a matching activity trail", () => {
    for (const job of SEED_JOBS) {
      expect(job.activity.length).toBeGreaterThan(0);
      if (job.appliedOn) expect(job.appliedOn >= job.addedOn).toBe(true);
    }
  });
});
