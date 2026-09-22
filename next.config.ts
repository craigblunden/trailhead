import type { NextConfig } from "next";

/**
 * Response headers that cost nothing to hold and would be awkward to add later, once something
 * depends on their absence. Each one is here for a reason; none of them is a substitute for the
 * things that actually enforce anything (row-level security, `requireSession()`, the bucket's own
 * limits), which is why this file is short.
 *
 * Deliberately NOT here: a Content-Security-Policy. Doing it properly under the App Router means
 * a per-request nonce through middleware, which turns every statically rendered page dynamic, and
 * doing it improperly means `unsafe-inline`, which is a CSP in name only. It is worth its own
 * ticket rather than a line in this file.
 */
const SECURITY_HEADERS = [
  // Vercel serves HTTPS and redirects HTTP; this stops the first request of a session being the
  // one that gets downgraded. Two years, subdomains included, and ready to be preloaded.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // An uploaded Document is served from Supabase Storage rather than from here, but this also
  // covers anything served out of `public/` or `_next/static` being sniffed into something else.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing in this application is meant to be framed, and a job board is exactly the kind of page
  // someone would try to overlay. `frame-ancestors` would say the same thing in a CSP.
  { key: "X-Frame-Options", value: "DENY" },
  // A posting URL is the user's own link to another site; it should not carry the path of the page
  // they were on when they followed it. The origin alone is enough for the destination's logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The Interview Simulator needs the microphone — answers are spoken, and the browser transcribes
  // them here rather than sending audio anywhere. Everything else is off, so a dependency that
  // reaches for the camera or a location finds the door shut rather than a prompt.
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
