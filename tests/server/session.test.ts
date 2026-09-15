import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The session helpers with Auth replaced by a stub. `requireSession()` and `requirePageSession()`
 * are the two doors every render and every action go through, so their behaviour without a
 * valid session is pinned here: a render redirects, an action's caller gets an error to map.
 */
const auth = vi.hoisted(() => ({
  claims: null as null | {
    sub: string;
    email: string;
    user_metadata: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
}));

vi.mock("@/server/auth/supabase", () => ({
  createServerSupabase: async () => ({
    auth: {
      getClaims: async () => ({ data: auth.claims ? { claims: auth.claims } : null, error: null }),
      getUser: async () => {
        throw new Error("the session is read from verified claims, not a round trip to Auth");
      },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

beforeEach(() => {
  auth.claims = null;
});

describe("session (tickets 05, 12)", () => {
  it("SES-1: requireSession() throws when there is no valid session", async () => {
    const { requireSession, UnauthenticatedError } = await import("@/server/auth/session");
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("SES-2: requirePageSession() redirects to the ended-session path during a render", async () => {
    const { requirePageSession } = await import("@/server/auth/session");
    await expect(requirePageSession()).rejects.toThrow("NEXT_REDIRECT:/login?session=ended");
  });

  it("SES-3: a valid session yields an id, email, and a display name from sign-up", async () => {
    auth.claims = {
      sub: "6a0c2e20-0000-4000-8000-000000000001",
      email: "sam@example.com",
      user_metadata: { full_name: "  Sam Rivera " },
      app_metadata: { provider: "email", providers: ["email", "google"] },
    };
    const { requireSession } = await import("@/server/auth/session");
    expect(await requireSession()).toEqual({
      userId: "6a0c2e20-0000-4000-8000-000000000001",
      email: "sam@example.com",
      name: "Sam Rivera",
      providers: ["email", "google"],
    });
  });

  it("SES-3: falls back to the local part of the email when no name was given", async () => {
    auth.claims = { sub: "6a0c2e20-0000-4000-8000-000000000002", email: "dana@example.com", user_metadata: {} };
    const { requireSession } = await import("@/server/auth/session");
    expect((await requireSession()).name).toBe("dana");
  });

  it("SES-4: the ways the Account signs in come from the token, falling back to its one provider", async () => {
    auth.claims = {
      sub: "6a0c2e20-0000-4000-8000-000000000003",
      email: "lee@example.com",
      user_metadata: {},
      app_metadata: { provider: "github" },
    };
    const { requireSession } = await import("@/server/auth/session");
    expect((await requireSession()).providers).toEqual(["github"]);
  });

  it("SES-4: a token with no provider at all yields none, not a guess", async () => {
    auth.claims = { sub: "6a0c2e20-0000-4000-8000-000000000004", email: "kim@example.com", user_metadata: {} };
    const { requireSession } = await import("@/server/auth/session");
    expect((await requireSession()).providers).toEqual([]);
  });
});
