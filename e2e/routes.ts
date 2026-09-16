/** The signed-out screens every cross-cutting e2e check sweeps. */
export const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "signup", path: "/signup" },
  { name: "login", path: "/login" },
  { name: "forgot-password", path: "/forgot-password" },
] as const;

/**
 * The signed-in screens, each with the level-one heading that says it has rendered. The job detail
 * and contact pages are not listed: they need records the test created itself, so the sweeps open
 * them through `createJob()` from `./fixtures` (and e2e/contacts.spec.ts).
 */
export const PRIVATE_ROUTES = [
  { name: "board", path: "/board", heading: "Your trail" },
  { name: "contacts", path: "/contacts", heading: "Contacts" },
  { name: "documents", path: "/documents", heading: "Documents" },
  // The hub, not a Job's start screen: the latter needs a Job the test created, like the job detail
  // and contact pages, so `e2e/interview.spec.ts` opens that one for itself.
  { name: "interview", path: "/interview", heading: "Interview practice" },
  { name: "account", path: "/account", heading: "Account" },
] as const;

/** Spec RESP-1 names these four widths explicitly. */
export const BREAKPOINTS = [320, 768, 1024, 1440] as const;
