import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_FEEDBACK_MAX_CHARS } from "@/lib/app-feedback";
import { sendAppFeedbackAction } from "@/server/actions/app-feedback";
import type { Session } from "@/server/auth/session";
import { composeAppFeedbackEmail } from "@/server/mail/app-feedback";
import { appFeedbackSchema, parseInput } from "@/server/validation";

/**
 * App feedback: a rating and the user's own words, emailed to the owner through Resend and stored
 * nowhere. The session is stubbed and `fetch` is replaced, so nothing here sends real mail.
 */

const session = vi.hoisted(() => ({ current: null as Session | null }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () => session.current,
    requireSession: async () => {
      if (!session.current) throw new actual.UnauthenticatedError();
      return session.current;
    },
  };
});

const SIGNED_IN: Session = { userId: "6a0c2e20-0000-4000-8000-000000000001", email: "sam@example.com", name: "Sam Rivera", providers: ["email"] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  session.current = SIGNED_IN;
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("APP_FEEDBACK_TO_EMAIL", "owner@example.com");
  vi.stubEnv("APP_FEEDBACK_FROM_EMAIL", "");
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("appFeedbackSchema", () => {
  it("takes a whole rating from one to five and the user's words, trimmed", () => {
    expect(parseInput(appFeedbackSchema, { rating: 4, message: "  The board is lovely.  " })).toEqual({
      ok: true,
      data: { rating: 4, message: "The board is lovely." },
    });
  });

  it.each([0, 6, 2.5, "5", null])("refuses a rating of %s", (rating) => {
    const result = parseInput(appFeedbackSchema, { rating, message: "Hello" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.rating).toBeDefined();
  });

  it("refuses words that are blank once invisible characters are gone", () => {
    const result = parseInput(appFeedbackSchema, { rating: 3, message: " \u200B\u200B " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.message).toMatch(/tell us/i);
  });

  it("bounds the words", () => {
    const result = parseInput(appFeedbackSchema, { rating: 3, message: "a".repeat(APP_FEEDBACK_MAX_CHARS + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.message).toMatch(String(APP_FEEDBACK_MAX_CHARS));
  });

  it("rejects fields it does not know rather than passing them along", () => {
    expect(parseInput(appFeedbackSchema, { rating: 3, message: "Hi", to: "someone@else.com" }).ok).toBe(false);
  });
});

describe("composeAppFeedbackEmail", () => {
  it("puts the rating in the subject and the words, rating and sender in a plain-text body", () => {
    const email = composeAppFeedbackEmail(SIGNED_IN, { rating: 2, message: "Dragging cards is fiddly on a phone." });

    expect(email.subject).toBe("Trailhead feedback: 2/5 from Sam Rivera");
    expect(email.text).toContain("Rating: 2/5");
    expect(email.text).toContain("Dragging cards is fiddly on a phone.");
    expect(email.text).toContain("Sam Rivera <sam@example.com>");
    expect(email.text).toContain(SIGNED_IN.userId);
    // The owner answers by replying.
    expect(email.replyTo).toBe("sam@example.com");
  });

  it("keeps a line break in a name out of the subject", () => {
    const email = composeAppFeedbackEmail({ ...SIGNED_IN, name: "Sam\r\nBcc: x@example.com" }, { rating: 5, message: "Hi" });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe("sendAppFeedbackAction", () => {
  it("emails the owner through Resend and answers ok", async () => {
    const result = await sendAppFeedbackAction({ rating: 5, message: "Love it." });

    expect(result).toEqual({ ok: true, data: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      to: ["owner@example.com"],
      reply_to: "sam@example.com",
      subject: "Trailhead feedback: 5/5 from Sam Rivera",
    });
    expect(body.from).toMatch(/@/);
    expect(body.text).toContain("Love it.");
  });

  it("uses the configured sender when there is one", async () => {
    vi.stubEnv("APP_FEEDBACK_FROM_EMAIL", "Trailhead <feedback@trailhead.example>");
    await sendAppFeedbackAction({ rating: 5, message: "Love it." });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.from).toBe("Trailhead <feedback@trailhead.example>");
  });

  it("answers invalid, and sends nothing, for input that does not parse", async () => {
    const result = await sendAppFeedbackAction({ rating: 9, message: "" });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers unauthenticated, and sends nothing, without a session", async () => {
    session.current = null;
    const result = await sendAppFeedbackAction({ rating: 5, message: "Love it." });
    expect(result).toMatchObject({ ok: false, error: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without leaking detail when Resend refuses, and logs the status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 }));

    const result = await sendAppFeedbackAction({ rating: 5, message: "Love it." });

    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(JSON.stringify(result)).not.toMatch(/resend|api key|401/i);
    const line = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string);
    expect(line).toMatchObject({ operation: "appFeedback.send", tenant: SIGNED_IN.userId });
    expect(line.error.message).toMatch(/401/);
  });

  it("fails, and sends nothing, when mail is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendAppFeedbackAction({ rating: 5, message: "Love it." });
    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
