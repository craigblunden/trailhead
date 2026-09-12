"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { LoadingTrail, TrailMark } from "@/components/loading-trail";

/*
 * A navigation's wait always stands in the same place: in the header, beside the account menu. The
 * header is pinned between pages and the menu never moves, so the hiker is where the user last saw
 * it whichever page is on its way — the board, a Job, a Contact inside the list's layout.
 *
 * The header holds an empty slot; a loading state anywhere below it renders `PageWait`, which is
 * drawn into that slot. The slot registers itself here when it mounts, before the browser paints, so
 * the wait never appears anywhere else first.
 */

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSlot(next: HTMLElement | null) {
  slot = next;
  for (const listener of listeners) listener();
}

/** Where the wait is drawn. Takes no room while empty, so a header's actions keep their spacing. */
export function PageWaitSlot() {
  return (
    <div
      ref={(node) => {
        if (!node) return;
        setSlot(node);
        return () => {
          if (slot === node) setSlot(null);
        };
      }}
      className="flex items-center empty:hidden"
    />
  );
}

/**
 * The wait for the page on its way: the hiker, and a sentence naming what is loading. One status
 * region. The sentence is shown where the header has room for it and read out everywhere.
 *
 * Nothing is drawn in the server's HTML, where there is no slot yet. Without a header at all it
 * stands inline, so a wait is never silently lost.
 */
export function PageWait({ children }: { children: string }) {
  const target = useSyncExternalStore(subscribe, () => slot, () => undefined);

  if (target === undefined) return null;
  if (target === null) return <LoadingTrail>{children}</LoadingTrail>;

  return createPortal(
    <div
      role="status"
      // Named so it fades out with the outline when the page arrives, rather than vanishing with the
      // pinned header's instant swap.
      style={{ viewTransitionName: "page-wait" }}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      {/* Beside the logo and nav only where the header has the width for it. */}
      <span className="sr-only sm:not-sr-only md:sr-only lg:not-sr-only">{children}</span>
      <TrailMark className="h-7 w-[5.25rem]" />
    </div>,
    target,
  );
}
