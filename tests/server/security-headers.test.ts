// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

/**
 * The response headers in `next.config.ts`, asserted as a contract rather than left to a reviewer
 * to notice going missing. They are cheap to hold and awkward to reintroduce once something depends
 * on their absence, and nothing else in the suite would fail if one were deleted.
 *
 * This proves the configuration, not the deployment: that every one of them is actually served is
 * a question for a response, and belongs to whatever checks the running application.
 */
async function headersFor(path: string) {
  const rules = await nextConfig.headers!();
  const matching = rules.filter((rule) => rule.source === "/:path*" || rule.source === path);
  expect(matching.length, `no header rule matches ${path}`).toBeGreaterThan(0);
  return new Map(matching.flatMap((rule) => rule.headers.map(({ key, value }) => [key, value])));
}

describe("security headers", () => {
  it("SEC-1: every response carries the headers that cost nothing to hold", async () => {
    const headers = await headersFor("/board");

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toMatch(/^max-age=\d{7,}; includeSubDomains/);
  });

  it("SEC-2: the Permissions-Policy allows the microphone the Simulator needs, and nothing else", async () => {
    const policy = (await headersFor("/interview")).get("Permissions-Policy") ?? "";

    // Answers are spoken; the browser transcribes them and no audio ever leaves it.
    expect(policy).toContain("microphone=(self)");
    // Everything else this application has no use for is shut, not merely unmentioned.
    for (const feature of ["camera", "geolocation", "payment"]) {
      expect(policy, `${feature} should be denied`).toContain(`${feature}=()`);
    }
  });

  it("SEC-3: the headers apply to API routes and auth callbacks too, not only to pages", async () => {
    for (const path of ["/api/jobs/abc/cover-letter", "/auth/confirm", "/llms.txt"]) {
      expect((await headersFor(path)).get("X-Content-Type-Options")).toBe("nosniff");
    }
  });
});
