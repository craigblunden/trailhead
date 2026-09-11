/**
 * The origin the browser actually used, for building redirects.
 *
 * `request.url` is reconstructed from the server's own hostname, so a browser at
 * `127.0.0.1:3100` can be redirected to `localhost:3100` — a different cookie jar, and a
 * freshly signed-in user lands on the sign-in page with no session. The `Host` header (or the
 * forwarded one behind Vercel's proxy) is what the browser thinks it is talking to.
 */
export function requestOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return new URL(fallback).origin;
  const proto = headers.get("x-forwarded-proto") ?? new URL(fallback).protocol.replace(":", "");
  return `${proto}://${host}`;
}
