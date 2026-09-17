"use client";

import { useSyncExternalStore } from "react";

import { TUTORIAL_SEEN_KEY } from "@/lib/tutorial";

/**
 * Whether this device has finished or skipped the Tutorial (practice feedback ticket 06), read from
 * localStorage. Every read and write is guarded: storage can be missing or refused (a private window, a
 * browser blocking site data), and then the Tutorial is simply offered again.
 *
 * Read as an external store with a server snapshot of `true`, so the offer is never drawn on the server
 * and then snatched away on hydration from a Tenant who already skipped it.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function seen(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** Remembers, on this device, that the Tutorial was finished or skipped. */
export function rememberTutorialSeen() {
  try {
    window.localStorage.setItem(TUTORIAL_SEEN_KEY, new Date().toISOString());
  } catch {
    // Nowhere to remember it: the offer comes back, which is harmless.
  }
  for (const listener of listeners) listener();
}

export function useTutorialSeen(): [seen: boolean, remember: () => void] {
  const value = useSyncExternalStore(subscribe, seen, () => true);
  return [value, rememberTutorialSeen];
}
