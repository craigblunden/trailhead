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
