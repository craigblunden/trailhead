import { ViewTransition } from "react";

/**
 * How a signed-in page arrives: it fades in over the loading outline that stood in for it, in place.
 * Wrap a page's return in `PageArrive` and a loading file's in `PageOutline`; the classes they name
 * are animated in `globals.css`. They belong in pages and loading files, never in a layout, which
 * persists across navigations and would swallow the enter and exit.
 *
 * `default="none"` keeps either from animating on anything but its own arrival or departure: a
 * revalidation, a Suspense reveal elsewhere, or the header's pinned swap.
 */
export function PageArrive({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-arrive" default="none">
      {children}
    </ViewTransition>
  );
}

export function PageOutline({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit="page-outline" default="none">
      {children}
    </ViewTransition>
  );
}
