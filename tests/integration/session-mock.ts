import { vi } from "vitest";

/**
 * The session is the one seam faked at the integration level: there is no request, so no cookie.
 * Prisma still runs against the real database under the real policies, and the data layer still
 * has no way to take a userId from a caller. Import this module before anything that reaches
 * `@/server/auth/session`, then call `signInAs()` — it is what the cookie would have said.
 */
const current = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  const session = async () =>
    current.userId ? { userId: current.userId, email: "tester@example.com", name: "Tester" } : null;
  return {
    ...actual,
    getOptionalSession: session,
    requireSession: async () => {
      const value = await session();
      if (!value) throw new actual.UnauthenticatedError();
      return value;
    },
  };
});

export function signInAs(userId: string) {
  current.userId = userId;
}

export function signOut() {
  current.userId = "";
}
