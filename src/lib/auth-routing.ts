/**
 * The optimistic routing rules `proxy.ts` applies, as pure functions so they can be unit tested.
 *
 * "Optimistic" is the whole point: these decisions are made from the session COOKIE, never from
 * asking Auth whether it is valid. They exist to spare a signed-out visitor a flash of an empty
 * board and a signed-in one a pointless sign-in form. They are not an authorization boundary —
 * deleting `proxy.ts` must make nothing reachable that the data layer does not already guard.
 */

/** Routes that only make sense signed in. */
const PROTECTED_PREFIXES = ["/board", "/contacts", "/documents"];

/** Routes that only make sense signed out. */
const SIGNED_OUT_ONLY = ["/login", "/signup"];

/**
 * Where a page sends a visitor whose cookie did not hold up (expired, revoked, forged). The proxy
 * recognises this path, drops the cookie, and lets the sign-in page render instead of bouncing
 * the visitor back to the board on the strength of the same cookie.
 */
export const SESSION_ENDED_PATH = "/login?session=ended";

/** `@supabase/ssr` stores the session under `sb-<ref>-auth-token`, chunked as `.0`, `.1`, … */
const SESSION_COOKIE = /^sb-[^-]+(?:-[^-]+)*-auth-token(?:\.\d+)?$/;

export function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE.test(name);
}

export function hasSessionCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some(isSessionCookie);
}

export type CookiePair = { name: string; value: string };

/**
 * When the session in the cookie expires, as a unix timestamp in seconds — read from the cookie
 * alone, no network, no signature check. Null when there is no session cookie or it does not
 * parse. This decides routing and when to refresh; it never decides access.
 */
export function sessionExpiry(cookies: readonly CookiePair[]): number | null {
  const chunks = cookies
    .filter((cookie) => isSessionCookie(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (chunks.length === 0) return null;

  let raw = chunks.map((cookie) => cookie.value).join("");
  try {
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
    }
    const session = JSON.parse(raw) as { expires_at?: unknown };
    return typeof session.expires_at === "number" ? session.expires_at : null;
  } catch {
    return null;
  }
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** True for the request a page makes after finding no valid session behind a cookie. */
export function isSessionEndedRequest(pathname: string, search: URLSearchParams): boolean {
  return pathname === "/login" && search.get("session") === "ended";
}

/** Where to send this request, or null to let it through. */
export function authRedirect(pathname: string, signedIn: boolean): string | null {
  if (!signedIn && isProtectedPath(pathname)) return "/login";
  if (signedIn && SIGNED_OUT_ONLY.includes(pathname)) return "/board";
  return null;
}

/**
 * Only a same-origin path may be used as a post-auth destination. Anything else — a full URL, a
 * protocol-relative `//evil`, a backslash trick — falls back to the board, so a crafted link
 * cannot turn the confirm route into an open redirect.
 */
export function safeNextPath(candidate: string | null | undefined, fallback = "/board"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  return candidate;
}
