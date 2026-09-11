import { describe, expect, it } from "vitest";

import {
  SESSION_ENDED_PATH,
  authRedirect,
  hasSessionCookie,
  isProtectedPath,
  isSessionEndedRequest,
  safeNextPath,
  sessionExpiry,
} from "@/lib/auth-routing";

describe("hasSessionCookie", () => {
  it("PROXY-1: recognises the Supabase session cookie, chunked or not", () => {
    expect(hasSessionCookie(["sb-127-auth-token"])).toBe(true);
    expect(hasSessionCookie(["sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1"])).toBe(true);
    expect(hasSessionCookie(["sb-abcdefgh-auth-token-code-verifier"])).toBe(false);
    expect(hasSessionCookie(["theme", "_ga"])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});

describe("authRedirect", () => {
  it("PROXY-2: sends a signed-out visit to any board URL to sign-in", () => {
    for (const path of ["/board", "/board/abc", "/board/abc/anything", "/contacts", "/documents/x"]) {
      expect(authRedirect(path, false), path).toBe("/login");
    }
  });

  it("PROXY-2: sends a signed-in visit to sign-in or sign-up to the board", () => {
    expect(authRedirect("/login", true)).toBe("/board");
    expect(authRedirect("/signup", true)).toBe("/board");
  });

  it("PROXY-3: leaves everything else alone in both states", () => {
    for (const path of ["/", "/auth/confirm", "/boardroom", "/forgot-password"]) {
      expect(authRedirect(path, false), path).toBeNull();
      expect(authRedirect(path, true), path).toBeNull();
    }
    expect(authRedirect("/board", true)).toBeNull();
    expect(authRedirect("/login", false)).toBeNull();
  });

  it("PROXY-3: a prefix match is a path segment, not a string prefix", () => {
    expect(isProtectedPath("/boardroom")).toBe(false);
    expect(isProtectedPath("/board")).toBe(true);
    expect(isProtectedPath("/board/")).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("PROXY-4: accepts only same-origin paths as a post-auth destination", () => {
    expect(safeNextPath("/board/abc")).toBe("/board/abc");
    expect(safeNextPath(null)).toBe("/board");
    expect(safeNextPath("")).toBe("/board");
    expect(safeNextPath("https://evil.example/")).toBe("/board");
    expect(safeNextPath("//evil.example/")).toBe("/board");
    expect(safeNextPath("/\\evil.example")).toBe("/board");
    expect(safeNextPath("board")).toBe("/board");
  });
});

describe("sessionExpiry", () => {
  const encode = (session: unknown) =>
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

  it("PROXY-5: reads the expiry out of the session cookie without any network", () => {
    const cookies = [{ name: "sb-127-auth-token", value: encode({ expires_at: 1_800_000_000 }) }];
    expect(sessionExpiry(cookies)).toBe(1_800_000_000);
  });

  it("PROXY-5: reassembles a chunked cookie in order", () => {
    const whole = encode({ access_token: "x".repeat(4000), expires_at: 1_800_000_001 });
    const cookies = [
      { name: "sb-abcdefgh-auth-token.1", value: whole.slice(2000) },
      { name: "sb-abcdefgh-auth-token.0", value: whole.slice(0, 2000) },
      { name: "theme", value: "light" },
    ];
    expect(sessionExpiry(cookies)).toBe(1_800_000_001);
  });

  it("PROXY-5: treats a missing, malformed, or forged cookie as no session", () => {
    expect(sessionExpiry([])).toBeNull();
    expect(sessionExpiry([{ name: "sb-127-auth-token", value: "garbage" }])).toBeNull();
    expect(sessionExpiry([{ name: "sb-127-auth-token", value: encode({ access_token: "forged" }) }]))
      .toBeNull();
  });
});

describe("isSessionEndedRequest", () => {
  it("PROXY-6: recognises the path a page uses after a cookie failed validation", () => {
    expect(isSessionEndedRequest("/login", new URLSearchParams("session=ended"))).toBe(true);
    expect(isSessionEndedRequest("/login", new URLSearchParams(""))).toBe(false);
    expect(isSessionEndedRequest("/board", new URLSearchParams("session=ended"))).toBe(false);
    expect(SESSION_ENDED_PATH).toBe("/login?session=ended");
  });
});
