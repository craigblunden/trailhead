import { describe, expect, it } from "vitest";

import { calendarDate, isoDateLocal } from "@/lib/dates";

describe("calendarDate", () => {
  it("reads a YYYY-MM-DD as the local day it names, round-tripping through isoDateLocal", () => {
    for (const iso of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      expect(isoDateLocal(calendarDate(iso))).toBe(iso);
    }
  });

  it("never shifts a day, unlike parsing the string as UTC", () => {
    // `new Date("2026-06-30")` is UTC midnight, which reads back as June 29th in any timezone
    // behind UTC — the bug this pair of helpers exists to avoid for date-picker widgets.
    const date = calendarDate("2026-06-30");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(30);
  });
});
