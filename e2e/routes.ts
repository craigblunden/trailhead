/** The screens every cross-cutting e2e check sweeps. */
export const ROUTES = [
  { name: "landing", path: "/" },
  { name: "signup", path: "/signup" },
  { name: "login", path: "/login" },
  { name: "board", path: "/board" },
  { name: "detail", path: "/board/harvest-lead-product-designer" },
] as const;

/** Spec RESP-1 names these four widths explicitly. */
export const BREAKPOINTS = [320, 768, 1024, 1440] as const;
