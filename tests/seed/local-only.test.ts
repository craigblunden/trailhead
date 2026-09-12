// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assertLocalStack } from "../../scripts/seed/local-only";

/** The values `.env.example` carries for the local stack. */
const LOCAL = {
  DATABASE_URL: "postgresql://trailhead_app.pooler-dev:trailhead_app@127.0.0.1:54329/postgres",
  DIRECT_URL: "postgresql://trailhead_migrator:trailhead_migrator@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  TEST_MAIL_API_URL: "http://127.0.0.1:54324",
};

describe("the seed runs against the local stack only", () => {
  it("SEED-12: accepts the local stack, and refuses any database, Auth, or mail URL that is not loopback", () => {
    expect(() => assertLocalStack(LOCAL)).not.toThrow();
    expect(() =>
      assertLocalStack({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", TEST_MAIL_API_URL: undefined }),
    ).not.toThrow();

    const refused: [string, Record<string, string | undefined>][] = [
      [
        "a hosted pooler",
        { ...LOCAL, DATABASE_URL: "postgresql://trailhead_app.abcd:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres" },
      ],
      ["a hosted project", { ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }],
      // The Plan row is written over the direct URL, so a hosted one is refused as firmly as the pooler.
      [
        "a hosted direct connection",
        { ...LOCAL, DIRECT_URL: "postgresql://trailhead_migrator:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres" },
      ],
      ["no direct connection at all", { ...LOCAL, DIRECT_URL: undefined }],
      ["a host that only starts like loopback", { ...LOCAL, DATABASE_URL: "postgresql://u:p@127.0.0.1.example.com:5432/postgres" }],
      // pg connects to a `host` query parameter over the authority, so a loopback authority proves nothing.
      ["a host parameter", { ...LOCAL, DATABASE_URL: "postgresql://u:p@127.0.0.1:54329/postgres?host=db.example.com" }],
      ["remote mail", { ...LOCAL, TEST_MAIL_API_URL: "https://mail.example.com" }],
      ["no database at all", { ...LOCAL, DATABASE_URL: undefined }],
      ["no Auth at all", { ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: undefined }],
    ];
    for (const [why, env] of refused) {
      expect(() => assertLocalStack(env), why).toThrow(/local stack only/);
    }
  });
});
