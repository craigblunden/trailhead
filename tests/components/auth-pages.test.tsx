import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";

/**
 * The two auth pages as the server renders them, with the session and the actions stubbed. The
 * flag's rule is unit-tested in `tests/lib/social-providers.test.ts`; this pins that the pages read
 * it from the real environment — so a clean clone, with no OAuth credentials, gets working forms
 * and no dead buttons. (The e2e server runs with placeholder credentials, so it cannot show this.)
 */
vi.mock("@/server/auth/session", () => ({ getOptionalSession: async () => null }));
vi.mock("@/server/auth/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  resendVerificationAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const CREDENTIALS = [
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
];

const PAGES = [
  { name: "/login", render: async () => render(await LoginPage({ searchParams: Promise.resolve({}) })), submit: "Sign in" },
  { name: "/signup", render: async () => render(await SignupPage()), submit: "Create account" },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth pages and the social sign-in flag (ticket 07)", () => {
  for (const page of PAGES) {
    it(`SOC-12: ${page.name} without OAuth credentials is a working form with no provider button`, async () => {
      for (const name of CREDENTIALS) vi.stubEnv(name, "");

      await page.render();

      expect(screen.getByLabelText("Email")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: page.submit })).toBeEnabled();
      expect(screen.queryAllByRole("button", { name: /Continue with/ })).toEqual([]);
    });

    it(`SOC-12: ${page.name} with both providers' credentials offers both`, async () => {
      for (const name of CREDENTIALS) vi.stubEnv(name, "configured");

      await page.render();

      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    });
  }
});
