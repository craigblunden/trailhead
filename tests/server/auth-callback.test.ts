import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where every social sign-in comes back to. The provider and Auth have already done their part;
 * this route turns the PKCE code into a session cookie and decides where the user lands. Auth is
 * stubbed here; the real round trip runs in `tests/integration/social-linking.test.ts` and
 * `e2e/social-sign-in.spec.ts`.
 */
const auth = vi.hoisted(() => ({
  exchange: vi.fn<(code: string) => Promise<{ data: object; error: Error | null }>>(),
}));

vi.mock("@/server/auth/supabase", () => ({
  createServerSupabase: async () => ({ auth: { exchangeCodeForSession: auth.exchange } }),
}));

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.spyOn(console, "error").mockImplementation((line: string) => {
  logged.lines.push(String(line));
});

async function callback(query: string) {
  const { GET } = await import("@/app/auth/callback/route");
  const request = new NextRequest(`http://localhost:3100/auth/callback${query}`, {
    headers: { host: "127.0.0.1:3100" },
  });
  const response = await GET(request);
  return { status: response.status, location: response.headers.get("location") };
}

beforeEach(() => {
  auth.exchange.mockReset();
  auth.exchange.mockResolvedValue({ data: {}, error: null });
  logged.lines = [];
});

describe("OAuth callback (ticket 07)", () => {
  it("SOC-6: exchanges the code for a session and lands on the board, on the origin the browser used", async () => {
    const { status, location } = await callback("?code=pkce-code");

    expect(auth.exchange).toHaveBeenCalledExactlyOnceWith("pkce-code");
    expect(status).toBe(307);
    expect(location).toBe("http://127.0.0.1:3100/board");
  });

  it("SOC-7: a refusal at the provider lands on sign-in with a notice, and exchanges nothing", async () => {
    const { location } = await callback(
      "?error=access_denied&error_code=provider_denied&error_description=The+user+said+no",
    );

    expect(auth.exchange).not.toHaveBeenCalled();
    expect(location).toBe("http://127.0.0.1:3100/login?error=oauth");
  });

  it("SOC-7: a missing code is the same recoverable landing, never a 500", async () => {
    expect((await callback("")).location).toBe("http://127.0.0.1:3100/login?error=oauth");
  });

  it("SOC-7: a failed exchange (reused or expired code, lost verifier) lands on sign-in and is logged without the code", async () => {
    auth.exchange.mockResolvedValue({ data: {}, error: new Error("invalid flow state") });

    const { location } = await callback("?code=secret-code");

    expect(location).toBe("http://127.0.0.1:3100/login?error=oauth");
    expect(logged.lines).toHaveLength(1);
    expect(logged.lines[0]).toContain("auth.oauth-callback");
    expect(logged.lines[0]).not.toContain("secret-code");
  });
});
