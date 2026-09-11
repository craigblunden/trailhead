import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

/*
 * The cover-letter card asks the server how many letters are left. Component tests never have a
 * server, so every job page renders against a quiet default; tests/components/cover-letter.test.tsx
 * replaces this with its own controllable fake.
 */
vi.mock("@/components/job/cover-letter-client", () => ({
  coverLetterClient: {
    status: async () => ({ limit: 5, used: 0, remaining: 5, resetsOn: "2026-07-27", available: true }),
    generate: async () => ({ ok: false, error: "unavailable", message: "Not in component tests." }),
  },
}));

afterEach(() => {
  cleanup();
});

/*
 * jsdom gaps that Radix primitives depend on. Without these the Select and
 * Dialog throw on open rather than failing an assertion, which makes for
 * genuinely confusing test output.
 */

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// A test file may opt into the node environment (e.g. extraction, which pdf.js wants DOM-free);
// the DOM gaps below only exist to be filled under jsdom.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (!globalThis.matchMedia) {
    globalThis.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
  }
}
