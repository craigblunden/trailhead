/**
 * The seed creates accounts with a password printed in the terminal and in the README. It must
 * never reach a hosted project, so every URL it would use is checked before anything runs — the same
 * refusal the e2e teardown makes, applied to Auth and mail as well as the database.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isLoopback(url: string | undefined, protocols: readonly string[]): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    protocols.includes(parsed.protocol) &&
    LOOPBACK_HOSTS.has(parsed.hostname) &&
    // pg connects to these over the URL's own host, so a loopback authority alone proves nothing.
    !parsed.searchParams.has("host") &&
    !parsed.searchParams.has("hostaddr")
  );
}

/** Throws unless the database, Auth, and (when set) mail URLs all point at this machine. */
export function assertLocalStack(env: Record<string, string | undefined>): void {
  const checks: [string, string | undefined, readonly string[]][] = [
    ["DATABASE_URL", env.DATABASE_URL, ["postgresql:", "postgres:"]],
    ["NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL, ["http:"]],
  ];
  if (env.TEST_MAIL_API_URL !== undefined) checks.push(["TEST_MAIL_API_URL", env.TEST_MAIL_API_URL, ["http:"]]);

  for (const [name, value, protocols] of checks) {
    if (!isLoopback(value, protocols)) {
      throw new Error(
        `db:seed runs against the local stack only, and ${name} is not a loopback URL. ` +
          "Start it with npm run supabase:start and use the values in .env.example.",
      );
    }
  }
}
