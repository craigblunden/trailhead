import { randomBytes } from "node:crypto";
import http from "node:http";

/**
 * A fake OAuth identity provider for the local Auth server's TEST-ONLY `gitlab` slot
 * (`supabase/config.toml`). Auth, running in Docker, reaches it at `host.docker.internal:54399`;
 * it listens on loopback only, so nothing outside this machine can ask it for an identity.
 *
 * It speaks just enough of GitLab's OAuth and REST surface for Auth to complete a sign-in, and
 * hands out whichever identity the test chose. What Auth then does with that identity — create a
 * user, link it to an existing one, refuse it — is the real Auth server's behaviour, not ours.
 */

export const FAKE_PROVIDER_PORT = 54399;
/** The Auth provider slot the fake stands behind. The app never offers it as a button. */
export const FAKE_PROVIDER_SLOT = "gitlab";

export type FakeIdentity = {
  /** The provider's own stable user id — what Auth matches a returning identity on first. */
  providerUserId: number;
  email: string;
  /** Whether the provider vouches that this person controls `email`. */
  emailVerified: boolean;
  name: string;
  /** Refuse at the consent screen instead of issuing a code. */
  deny?: boolean;
};

export type FakeProvider = {
  /** The identity the next authorization hands out. */
  setIdentity(identity: FakeIdentity): void;
  /** Every request the provider saw, as `METHOD path`. */
  readonly requests: string[];
  /**
   * Plays the consent screen for an authorize URL Auth sent the browser to: returns where the
   * provider redirects next. Lets a browser that cannot resolve `host.docker.internal` take part.
   */
  authorize(authorizeUrl: string): Promise<string>;
  close(): Promise<void>;
};

/** A fresh provider user id, so no test reaches an identity another test created. */
export function newProviderUserId(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Requests `url` without following it and returns where it redirects. */
export async function redirectLocation(url: string | URL): Promise<string> {
  const response = await fetch(url, { redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) throw new Error(`expected a redirect from ${url}, got ${response.status}`);
  return location;
}

function json(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startFakeProvider(): Promise<FakeProvider> {
  let identity: FakeIdentity | null = null;
  const byCode = new Map<string, FakeIdentity>();
  const byToken = new Map<string, FakeIdentity>();
  const requests: string[] = [];

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${FAKE_PROVIDER_PORT}`);
    requests.push(`${request.method} ${url.pathname}`);

    if (url.pathname === "/oauth/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      if (!identity || identity.deny) {
        redirect.searchParams.set("error", "access_denied");
      } else {
        const code = randomBytes(12).toString("hex");
        byCode.set(code, identity);
        redirect.searchParams.set("code", code);
      }
      response.writeHead(302, { location: redirect.toString() });
      return response.end();
    }

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      const code = new URLSearchParams(await readBody(request)).get("code") ?? "";
      const granted = byCode.get(code);
      if (!granted) return json(response, 400, { error: "invalid_grant" });
      byCode.delete(code);
      const token = randomBytes(12).toString("hex");
      byToken.set(token, granted);
      return json(response, 200, { access_token: token, token_type: "bearer", expires_in: 3600 });
    }

    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const caller = byToken.get(bearer);

    if (url.pathname === "/api/v4/user") {
      if (!caller) return json(response, 401, { message: "401 Unauthorized" });
      return json(response, 200, {
        id: caller.providerUserId,
        username: `user${caller.providerUserId}`,
        name: caller.name,
        email: caller.email,
        avatar_url: "",
        confirmed_at: caller.emailVerified ? "2026-01-01T00:00:00Z" : null,
      });
    }

    if (url.pathname === "/api/v4/user/emails") {
      if (!caller) return json(response, 401, { message: "401 Unauthorized" });
      return json(response, 200, []);
    }

    json(response, 404, { message: "not faked" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_PROVIDER_PORT, "127.0.0.1", resolve);
  });

  return {
    setIdentity(next) {
      identity = next;
    },
    requests,
    async authorize(authorizeUrl) {
      const local = new URL(authorizeUrl);
      local.hostname = "127.0.0.1";
      return redirectLocation(local);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
