"use client";

import { usePathname } from "next/navigation";

export type SceneSection = "board" | "contacts" | "documents";

/** The section whose foreground the scene shows on this URL; null where the page draws no scene. */
export function sceneSectionFor(pathname: string): SceneSection | null {
  if (pathname === "/board") return "board";
  if (pathname === "/contacts" || pathname.startsWith("/contacts/")) return "contacts";
  if (pathname === "/documents") return "documents";
  // A Job's page is for reading and writing at length, and runs on a plain background.
  return null;
}

/**
 * The landscape beneath the signed-in sections. It lives in the `(app)` layout, which persists across
 * navigations, so the ridgeline stays put while pages and their loading outlines come and go; only
 * the foreground changes, crossfading to the section the URL is about (see `[data-scene-part]` in
 * `globals.css`). The URL changes the moment a navigation starts, so the new foreground is already
 * there beneath the loading outline.
 *
 * The scene itself is rendered by the server and handed in, so its drawing stays out of the
 * browser's JavaScript.
 */
export function SectionScene({ children }: { children: React.ReactNode }) {
  const section = sceneSectionFor(usePathname() ?? "");

  return (
    <div data-scene={section ?? undefined} hidden={section === null}>
      {children}
    </div>
  );
}
