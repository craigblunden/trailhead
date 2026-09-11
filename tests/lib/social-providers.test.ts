import { describe, expect, it } from "vitest";

import { SOCIAL_PROVIDERS, enabledSocialProviders } from "@/lib/social-providers";

const GOOGLE = {
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "google-id",
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "google-secret",
};
const GITHUB = {
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: "github-id",
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: "github-secret",
};

describe("social sign-in flag (ticket 07)", () => {
  it("SOC-1: a clean clone with no OAuth credentials offers no provider", () => {
    expect(enabledSocialProviders({})).toEqual([]);
  });

  it("SOC-1: a provider needs BOTH its client id and its secret", () => {
    expect(
      enabledSocialProviders({ SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "google-id" }),
    ).toEqual([]);
    expect(enabledSocialProviders({ SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: "github-secret" })).toEqual(
      [],
    );
  });

  it("SOC-1: a blank value counts as absent, as `.env.example` leaves them", () => {
    expect(
      enabledSocialProviders({
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "   ",
        SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "google-secret",
      }),
    ).toEqual([]);
  });

  it("SOC-1: each provider is decided on its own credentials", () => {
    expect(enabledSocialProviders(GITHUB).map((p) => p.id)).toEqual(["github"]);
    expect(enabledSocialProviders(GOOGLE).map((p) => p.id)).toEqual(["google"]);
  });

  it("SOC-1: with both configured, the order is stable: Google, then GitHub", () => {
    expect(enabledSocialProviders({ ...GITHUB, ...GOOGLE }).map((p) => p.id)).toEqual([
      "google",
      "github",
    ]);
  });

  it("SOC-1: what reaches the page is a name and an id, never a credential", () => {
    const serialised = JSON.stringify(enabledSocialProviders({ ...GITHUB, ...GOOGLE }));
    expect(serialised).not.toMatch(/google-id|google-secret|github-id|github-secret/);
    expect(SOCIAL_PROVIDERS.map((p) => p.label)).toEqual(["Google", "GitHub"]);
  });
});
