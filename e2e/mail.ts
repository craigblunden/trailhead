/**
 * Reads the mail the local Supabase stack delivers to Mailpit, so the e2e suite can follow real
 * verification and reset links instead of poking at the database.
 */

const MAIL_API = process.env.TEST_MAIL_API_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; Subject: string; Created: string };

async function search(email: string): Promise<Summary[]> {
  const url = `${MAIL_API}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  const body = (await response.json()) as { messages?: Summary[] };
  return body.messages ?? [];
}

/**
 * The newest message to `email` whose subject matches, waiting up to `timeoutMs` for it to
 * arrive. Returns the links found in its HTML body.
 */
export async function waitForMail(
  email: string,
  subject: RegExp,
  { timeoutMs = 15_000, after = 0 }: { timeoutMs?: number; after?: number } = {},
): Promise<{ id: string; subject: string; links: string[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matches = (await search(email))
      .filter((m) => subject.test(m.Subject) && new Date(m.Created).getTime() >= after)
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
    const newest = matches[0];
    if (newest) {
      const response = await fetch(`${MAIL_API}/api/v1/message/${newest.ID}`);
      const message = (await response.json()) as { HTML?: string; Text?: string };
      const html = message.HTML ?? message.Text ?? "";
      const links = Array.from(html.matchAll(/href="([^"]+)"/g), (m) =>
        m[1].replace(/&amp;/g, "&"),
      );
      return { id: newest.ID, subject: newest.Subject, links };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No mail matching ${subject} arrived for ${email} within ${timeoutMs}ms`);
}

/** A fresh, unique address so no test depends on a previous run's account. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
