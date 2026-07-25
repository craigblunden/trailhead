import type { AxeMatchers } from "vitest-axe/matchers";

/**
 * vitest-axe still ships its types against the legacy global `Vi` namespace,
 * which Vitest 4 no longer reads. Augment the module directly instead.
 */
declare module "vitest" {
  // Declaration merging is the whole point here, so the interface is empty by
  // design — the rule cannot express that case.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers extends AxeMatchers {}
}

export {};
