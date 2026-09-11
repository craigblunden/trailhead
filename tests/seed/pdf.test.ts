// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractDocumentText } from "@/server/ingest/extract";

import { documentText, textPdf } from "../../scripts/seed/pdf";

const LINES = [
  "Sam Rivera - Senior Product Designer",
  "Austin, TX - sam.rivera@example.com",
  "I'd love to talk about Fernwood's `growth` loop.",
  "Skills: interaction design, design systems (Figma), research synthesis \\ prototyping.",
];

/**
 * Written out by hand: what a reader of the file sees, one line per line. The straight quote and the
 * backtick come back as themselves — a PDF font's default encoding would turn them into curly quotes.
 */
const TEXT = [
  "Sam Rivera - Senior Product Designer",
  "Austin, TX - sam.rivera@example.com",
  "I'd love to talk about Fernwood's `growth` loop.",
  "Skills: interaction design, design systems (Figma), research synthesis \\ prototyping.",
].join("\n");

describe("seed documents are real files", () => {
  it("SEED-1: a seeded PDF passes the app's own extraction, and reads back as exactly the text the seed stores", async () => {
    expect(await extractDocumentText(textPdf(LINES), "pdf")).toEqual({ ok: true, text: TEXT });
    expect(documentText(LINES)).toBe(TEXT);
  });

  it("SEED-2: refuses text the page cannot show as written — non-ASCII, a line too wide, or too many lines", () => {
    expect(() => textPdf(["Senior Designer — Remote"])).toThrow(/ASCII/);
    expect(() => textPdf(["x".repeat(91)])).toThrow(/wide/);
    expect(() => textPdf(Array.from({ length: 41 }, (_, i) => `Line ${i}`))).toThrow(/lines/);
    expect(() => textPdf(["x".repeat(90), ...Array.from({ length: 39 }, (_, i) => `Line ${i}`)])).not.toThrow();
  });
});
