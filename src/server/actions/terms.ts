"use server";

import { runAction, type ActionResult } from "@/server/action-result";
import { acceptCurrentTerms } from "@/server/data/terms";

/**
 * Accepting the current terms (terms ticket 04). A Server Action rather than a Route Handler: it is
 * one small write with nothing to wait on, and it is the only thing the page it sits on can do.
 *
 * It revalidates nothing. The gate lives on the `(app)` layout, which a client-side navigation does
 * not re-render, so what takes it down is the gate's own `router.refresh()` — that refetches this
 * route's whole tree, layouts included, which is precisely what is needed and nothing more. Marking
 * every path stale from here would throw away the rest of the app's cache to redraw one screen.
 */
export async function acceptTermsAction(): Promise<ActionResult<null>> {
  return runAction("terms.accept", async () => {
    await acceptCurrentTerms();
    return null;
  });
}
