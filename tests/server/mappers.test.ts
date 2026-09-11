import { afterEach, describe, expect, it, vi } from "vitest";

import type { Job } from "@/lib/jobs";
import {
  toDateColumn,
  toIsoDate,
  toJobDto,
  todayIso,
  type JobRow,
} from "@/server/db/mappers";
import { FROZEN_ISO, FROZEN_NOW } from "../test-utils";

/** A plain row shaped like what Prisma returns for a job with its relations. No database. */
function row(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job_1",
    userId: "6a0c2e20-0000-4000-8000-000000000001",
    company: "Harvest & Co",
    role: "Lead Product Designer",
    location: "Onsite · Chicago",
    salaryMin: 140,
    salaryMax: 165,
    stage: "interviewing",
    postingUrl: "https://harvest.example.com/careers/lead-product-designer",
    addedOn: new Date("2026-06-26T00:00:00.000Z"),
    appliedOn: new Date("2026-06-30T00:00:00.000Z"),
    description: "Harvest & Co is a food-tech company.",
    notes: "Panel is 3 rounds.",
    accent: "wheat",
    documentId: null,
    document: null,
    createdAt: new Date("2026-06-26T09:00:00.000Z"),
    updatedAt: new Date("2026-06-26T09:00:00.000Z"),
    contacts: [],
    activity: [],
    ...overrides,
  };
}

function activity(
  id: string,
  label: string,
  date: string,
  createdAt: string,
): JobRow["activity"][number] {
  return {
    id,
    userId: "6a0c2e20-0000-4000-8000-000000000001",
    jobId: "job_1",
    label,
    date: new Date(`${date}T00:00:00.000Z`),
    createdAt: new Date(createdAt),
  };
}

function link(contact: {
  id: string;
  name: string;
  title?: string;
  email?: string;
}): JobRow["contacts"][number] {
  return {
    jobId: "job_1",
    contactId: contact.id,
    userId: "6a0c2e20-0000-4000-8000-000000000001",
    createdAt: new Date("2026-06-26T09:00:00.000Z"),
    contact: {
      id: contact.id,
      userId: "6a0c2e20-0000-4000-8000-000000000001",
      name: contact.name,
      kind: "recruiter",
      title: contact.title ?? "",
      email: contact.email ?? "",
      phone: "",
      agency: "",
      notes: "",
      lastSpokenOn: null,
      createdAt: new Date("2026-06-26T09:00:00.000Z"),
      updatedAt: new Date("2026-06-26T09:00:00.000Z"),
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("toJobDto", () => {
  it("MAP-1: produces exactly the Phase-1 Job shape — no field added, removed, or renamed", () => {
    const dto: Job = toJobDto(row());

    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "company",
        "role",
        "location",
        "salaryMin",
        "salaryMax",
        "stage",
        "postingUrl",
        "addedOn",
        "appliedOn",
        "resumeFile",
        "description",
        "notes",
        "contacts",
        "activity",
        "accent",
      ].sort(),
    );
    // Nothing from the row leaks through: no userId, no timestamps, no document row.
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("createdAt");
    expect(dto).not.toHaveProperty("document");
  });

  it("MAP-2: serialises date columns to YYYY-MM-DD strings in UTC", () => {
    const dto = toJobDto(row());

    expect(dto.addedOn).toBe("2026-06-26");
    expect(dto.appliedOn).toBe("2026-06-30");
    expect(toJobDto(row({ appliedOn: null })).appliedOn).toBeNull();
  });

  it("MAP-2: a date column never shifts by a day, whatever the process timezone", () => {
    // 1 Jan in UTC is 31 Dec in every negative-offset zone. The string form is what keeps
    // server and client rendering identical.
    expect(toIsoDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
    expect(toDateColumn("2026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(toIsoDate(toDateColumn("2026-07-25"))).toBe("2026-07-25");
  });

  it("MAP-3: orders activity newest first by date, then by creation time for a shared date", () => {
    const dto = toJobDto(
      row({
        activity: [
          activity("a1", "Added to board — Interested", "2026-06-26", "2026-06-26T09:00:00Z"),
          activity("a3", "Moved to Interviewing", "2026-07-14", "2026-07-14T10:00:00Z"),
          activity("a2", "Applied with resume", "2026-06-30", "2026-06-30T08:00:00Z"),
          // Same day as a3, written a minute later: it is the newer one.
          activity("a4", "Portfolio review scheduled", "2026-07-14", "2026-07-14T10:01:00Z"),
        ],
      }),
    );

    expect(dto.activity).toEqual([
      { id: "a4", label: "Portfolio review scheduled", date: "2026-07-14" },
      { id: "a3", label: "Moved to Interviewing", date: "2026-07-14" },
      { id: "a2", label: "Applied with resume", date: "2026-06-30" },
      { id: "a1", label: "Added to board — Interested", date: "2026-06-26" },
    ]);
  });

  it("MAP-3: activity ordering is deterministic even when date and creation time both tie", () => {
    const tied = [
      activity("b", "second", "2026-07-14", "2026-07-14T10:00:00Z"),
      activity("a", "first", "2026-07-14", "2026-07-14T10:00:00Z"),
    ];
    const once = toJobDto(row({ activity: tied })).activity.map((e) => e.id);
    const again = toJobDto(row({ activity: [...tied].reverse() })).activity.map((e) => e.id);

    expect(once).toEqual(again);
  });

  it("MAP-4: orders contacts stably, by name then id, whatever order the rows arrive in", () => {
    const links = [
      link({ id: "c2", name: "Tom Okafor", title: "Design Manager", email: "t@harvest.co" }),
      link({ id: "c3", name: "Jess Liu", title: "Recruiter", email: "jess@harvest.co" }),
      link({ id: "c1", name: "Jess Liu", title: "Recruiter", email: "jess.l@harvest.co" }),
    ];

    const forward = toJobDto(row({ contacts: links })).contacts;
    const backward = toJobDto(row({ contacts: [...links].reverse() })).contacts;

    expect(forward).toEqual([
      { id: "c1", name: "Jess Liu", title: "Recruiter", email: "jess.l@harvest.co" },
      { id: "c3", name: "Jess Liu", title: "Recruiter", email: "jess@harvest.co" },
      { id: "c2", name: "Tom Okafor", title: "Design Manager", email: "t@harvest.co" },
    ]);
    expect(backward).toEqual(forward);
  });

  it("MAP-5: exposes the attached document as its file name, and null when there is none", () => {
    expect(toJobDto(row()).resumeFile).toBeNull();

    const withDocument = row({
      documentId: "doc_1",
      document: {
        id: "doc_1",
        userId: "6a0c2e20-0000-4000-8000-000000000001",
        kind: "resume",
        fileName: "resume_lead_v1.pdf",
        storageKey: "6a0c2e20-0000-4000-8000-000000000001/doc_1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        text: "…",
        ingestion: "ready",
        ingestionError: null,
        deletedAt: null,
        createdAt: new Date("2026-06-26T09:00:00.000Z"),
        updatedAt: new Date("2026-06-26T09:00:00.000Z"),
      },
    });
    expect(toJobDto(withDocument).resumeFile).toBe("resume_lead_v1.pdf");
  });
});

describe("todayIso", () => {
  it("MAP-6: reads today as a UTC calendar date from a frozen clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);

    expect(todayIso()).toBe(FROZEN_ISO);
  });

  it("MAP-6: accepts an explicit clock, so callers can be tested without faking timers", () => {
    expect(todayIso(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12-31");
    expect(todayIso(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01-01");
  });
});
