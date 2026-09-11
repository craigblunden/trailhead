/** The signed-out screens every cross-cutting e2e check sweeps. */
export const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "signup", path: "/signup" },
  { name: "login", path: "/login" },
] as const;

/**
 * The signed-in screens. The job detail page is not listed: it needs a job the test created
 * itself, so the sweeps open it through `createJob()` from `./fixtures`.
 */
export const PRIVATE_ROUTES = [{ name: "board", path: "/board" }] as const;

/** Spec RESP-1 names these four widths explicitly. */
export const BREAKPOINTS = [320, 768, 1024, 1440] as const;
