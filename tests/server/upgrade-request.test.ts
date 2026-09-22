import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/server/auth/session";
import { composeUpgradeRequestEmail } from "@/server/mail/upgrade-request";
import { sendToOwner } from "@/server/mail/send";

/**
 * The email an Upgrade request (ADR-0009) puts in the owner's inbox, and the sender it shares with
 * App feedback. `fetch` is replaced, so nothing here sends real mail.
 */

const SESSION: Session = {
  userId: "6a0c2e20-0000-4000-8000-000000000001",
  email: "sam@example.com",
  name: "Sam Rivera",
  providers: ["email"],
};

const FIRST = { current: "free", wanted: "basic", asked: 1, since: new Date("2026-09-22") } as const;

describe("the upgrade request email (upgrade-requests ticket 03)", () => {
  it("MAIL-1: carries who asked, both Plans, and the command that grants it", () => {
    const email = composeUpgradeRequestEmail(SESSION, FIRST);

    expect(email.subject).toBe("Trailhead upgrade request: basic for Sam Rivera");
    expect(email.replyTo).toBe("sam@example.com");
    expect(email.text).toContain("Sam Rivera <sam@example.com>");
    expect(email.text).toContain("On: Free plan");
    expect(email.text).toContain("Wants: Basic plan");
    expect(email.text).toContain("User id: 6a0c2e20-0000-4000-8000-000000000001");
    expect(email.text).toContain("npm run db:plan -- sam@example.com basic");
  });

  it("MAIL-2: a repeat ask says how many and since when, so a long wait reads as one", () => {
    const first = composeUpgradeRequestEmail(SESSION, FIRST);
    expect(first.text).toContain("Asked for the first time");

    const third = composeUpgradeRequestEmail(SESSION, { ...FIRST, asked: 3, since: new Date("2026-06-04") });
    expect(third.text).toContain("Asked 3 times since 2026-06-04");
    // The subject does not move, so repeats thread together in the owner's inbox.
    expect(third.subject).toBe(first.subject);
  });

  it("MAIL-3: says that doing nothing is an answer, and what it means", () => {
    expect(composeUpgradeRequestEmail(SESSION, FIRST).text).toContain(
      "Doing nothing is a soft no: the request lapses after 14 days and they can ask again.",
    );
  });

  it("MAIL-4: a name with a newline in it cannot break the subject header", () => {
    const email = composeUpgradeRequestEmail({ ...SESSION, name: "Sam\r\nBcc: someone@example.com" }, FIRST);
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe("the shared owner sender (upgrade-requests ticket 03)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const body = () => JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as Record<string, unknown>;
  const email = { subject: "Subject", text: "Body", replyTo: "sam@example.com" };

  it("MAIL-5: reads the older APP_FEEDBACK_* names, so a deployment set up before the rename keeps working", async () => {
    vi.stubEnv("OWNER_TO_EMAIL", "");
    vi.stubEnv("APP_FEEDBACK_TO_EMAIL", "owner@example.com");
    vi.stubEnv("APP_FEEDBACK_FROM_EMAIL", "Trailhead <hello@trailhead.test>");

    await sendToOwner(email);

    expect(body().to).toEqual(["owner@example.com"]);
    expect(body().from).toBe("Trailhead <hello@trailhead.test>");
  });

  it("MAIL-6: the new names win when both are set", async () => {
    vi.stubEnv("OWNER_TO_EMAIL", "new@example.com");
    vi.stubEnv("APP_FEEDBACK_TO_EMAIL", "old@example.com");

    await sendToOwner(email);
    expect(body().to).toEqual(["new@example.com"]);
  });

  it("MAIL-7: unconfigured mail throws rather than quietly going nowhere", async () => {
    vi.stubEnv("OWNER_TO_EMAIL", "");
    vi.stubEnv("APP_FEEDBACK_TO_EMAIL", "");

    await expect(sendToOwner(email)).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("MAIL-8: plain text only — no HTML body is ever sent", async () => {
    vi.stubEnv("OWNER_TO_EMAIL", "owner@example.com");

    await sendToOwner(email);
    expect(body()).not.toHaveProperty("html");
    expect(body().text).toBe("Body");
  });
});
