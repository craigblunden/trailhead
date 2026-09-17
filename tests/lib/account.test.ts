import { describe, expect, it } from "vitest";

import { emailsMatch, signInMethodLabels } from "@/lib/account";

describe("the account page's pure rules (account issue 04)", () => {
  it("ACCT-1: the typed email matches the Account's trimmed and case-insensitively", () => {
    expect(emailsMatch(" Alex@Example.com ", "alex@example.com")).toBe(true);
    expect(emailsMatch("alex@example.com", "ALEX@example.com")).toBe(true);
    expect(emailsMatch("alex@example.co", "alex@example.com")).toBe(false);
    expect(emailsMatch("alex @example.com", "alex@example.com")).toBe(false);
  });

  it("ACCT-2: nothing typed never matches, even an Account with no email", () => {
    expect(emailsMatch("", "alex@example.com")).toBe(false);
    expect(emailsMatch("   ", "")).toBe(false);
    expect(emailsMatch("", "")).toBe(false);
  });

  it("ACCT-3: every way the Account signs in is named once, in the order Auth lists them", () => {
    expect(signInMethodLabels(["email"])).toEqual(["Email and password"]);
    expect(signInMethodLabels(["email", "google", "github"])).toEqual(["Email and password", "Google", "GitHub"]);
    expect(signInMethodLabels(["google", "google"])).toEqual(["Google"]);
    // A provider this app does not name still reads as a word.
    expect(signInMethodLabels(["gitlab"])).toEqual(["Gitlab"]);
    expect(signInMethodLabels([])).toEqual([]);
  });
});

describe("what Account deletion says goes (account issue 06)", () => {
  it("ACCT-8: counts every kind, pluralised", async () => {
    const { deletionContents } = await import("@/lib/account");
    expect(deletionContents({ jobs: 12, documents: 3, contacts: 8 })).toBe("12 jobs, 3 documents, and 8 contacts");
    expect(deletionContents({ jobs: 1, documents: 1, contacts: 1 })).toBe("1 job, 1 document, and 1 contact");
    expect(deletionContents({ jobs: 0, documents: 0, contacts: 0 })).toBe("0 jobs, 0 documents, and 0 contacts");
  });
});

describe("the interview Limits under Your plan", () => {
  const quota = { limit: 10, used: 1, remaining: 9, resetsOn: "2026-07-27" } as const;

  it("ACCT-9: counts interviews left against a finite Limit, and started ones under an unlimited Limit", async () => {
    const { interviewsLeftLine } = await import("@/lib/account");
    expect(interviewsLeftLine(quota)).toBe("9 of 10 interviews left this week");
    expect(interviewsLeftLine({ ...quota, used: 10, remaining: 0 })).toBe(
      "You’ve used this week’s interviews — more on Monday, Jul 27",
    );
    expect(interviewsLeftLine({ ...quota, limit: "unlimited", used: 1, remaining: "unlimited" })).toBe(
      "1 interview started this week",
    );
  });

  it("ACCT-10: names the lengths a Plan may choose between", async () => {
    const { interviewLengthsLine } = await import("@/lib/account");
    expect(interviewLengthsLine([5])).toBe("5 minutes");
    expect(interviewLengthsLine([5, 10])).toBe("5 or 10 minutes");
    expect(interviewLengthsLine([5, 10, 30])).toBe("5, 10, or 30 minutes");
  });
});
