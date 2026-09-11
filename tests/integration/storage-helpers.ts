import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import { signInAs, setSupabaseClient } from "./session-mock";
import { PASSWORD, authClient, passwordAccount } from "./social-helpers";

export type RealUser = { userId: string; email: string; client: SupabaseClient };

/**
 * A verified Supabase account signed in with a real session. Storage evaluates `auth.uid()` from
 * that session, so these tests exercise the storage policies themselves — nothing is faked below
 * the session seam.
 */
export async function realUser(): Promise<RealUser> {
  const { email, userId } = await passwordAccount();
  const client = authClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { userId, email, client };
}

/** Makes `user` the signed-in user for both the data layer and Storage. */
export function actAs(user: RealUser) {
  signInAs(user.userId);
  setSupabaseClient(user.client);
}

export const bucketOf = (user: RealUser) => user.client.storage.from("documents");

/** Removes every object under the user's prefix, as that user, so runs do not accumulate files. */
export async function emptyFolder(user: RealUser) {
  const bucket = bucketOf(user);
  const { data } = await bucket.list(user.userId, { limit: 100 });
  const keys = (data ?? []).map((object) => `${user.userId}/${object.name}`);
  if (keys.length > 0) await bucket.remove(keys);
}

export async function objectExists(user: RealUser, key: string): Promise<boolean> {
  const { data } = await bucketOf(user).exists(key);
  return Boolean(data);
}

export const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests", "fixtures", "documents", name));

/**
 * Does what the browser does with an upload ticket: PUTs the bytes straight to Storage through the
 * signed upload URL, with the declared Content-Type.
 */
export async function putObject(
  user: RealUser,
  ticket: { path: string; token: string; contentType: string },
  bytes: Buffer,
) {
  return bucketOf(user).uploadToSignedUrl(
    ticket.path,
    ticket.token,
    new Blob([new Uint8Array(bytes)], { type: ticket.contentType }),
    { contentType: ticket.contentType },
  );
}

/**
 * Runs SQL as `postgres`, the role `pg_cron` runs the janitor as. Local development credentials
 * only — the hosted project's are never in a file.
 */
export async function asJanitor<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString:
      process.env.TEST_POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
