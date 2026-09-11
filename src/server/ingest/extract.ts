import "server-only";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import type { DocumentExtension } from "@/lib/documents";

/**
 * Turns an uploaded file's bytes into text, at upload, while the user is present (ticket 15).
 * Extracting once is cheaper than at every generation, and a failure lands where the user can
 * act on it — re-export, remove a password, pick another file — instead of inside work they have
 * navigated away from.
 *
 * Neither the extension nor the declared type is trusted: the bucket checks only the Content-Type
 * header the browser sent (ticket 01), so the bytes are sniffed here before either parser runs.
 * Both parsers are pure JS (research 03): no native binaries in a serverless bundle.
 */

export const INGEST_LIMITS = {
  /** Checked before extracting, per unpdf's own warning: extraction reads every page at once. */
  maxPdfPages: 20,
  /** A backstop for a file that is mostly embedded junk. */
  maxCharacters: 150_000,
  /**
   * Below this many non-space characters a PDF is treated as having no text layer. A scan parses
   * fine and yields (near) nothing; a real one-page resume yields hundreds.
   */
  minCharacters: 50,
  /** Parsing runs on the event loop in a serverless build; it must not run unbounded. */
  timeoutMs: 20_000,
} as const;

export type ExtractionFailure =
  | "no-text-layer"
  | "password-protected"
  | "type-mismatch"
  | "unreadable"
  | "too-many-pages"
  | "too-much-text";

export type Extraction = { ok: true; text: string } | { ok: false; reason: ExtractionFailure };

export type Sniffed = "pdf" | "zip" | "cfb" | "unknown";

const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * What the bytes are, whatever the name says. A password-protected .docx is not a ZIP at all but an
 * OLE2 compound file (as is a legacy .doc); mammoth's own error cannot tell that from corruption.
 */
export function sniff(bytes: Uint8Array): Sniffed {
  const startsWith = (signature: number[], at = 0) =>
    signature.every((byte, index) => bytes[at + index] === byte);
  if (CFB.every((byte, index) => bytes[index] === byte)) return "cfb";
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return "zip";
  // The PDF header may follow a little leading junk; readers accept it within the first 1024 bytes.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (head.includes("%PDF-")) return "pdf";
  return "unknown";
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("extraction timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fromPdf(bytes: Uint8Array): Promise<Extraction> {
  let pdf;
  try {
    // pdf.js takes ownership of the buffer it is given; hand it a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      return { ok: false, reason: "password-protected" };
    }
    return { ok: false, reason: "unreadable" };
  }
  try {
    if (pdf.numPages > INGEST_LIMITS.maxPdfPages) return { ok: false, reason: "too-many-pages" };
    const { text } = await extractText(pdf, { mergePages: true });
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    // Frees pdf.js's parsed state now rather than at GC. Present at runtime, absent from unpdf's types.
    await (pdf as { destroy?: () => Promise<void> }).destroy?.().catch(() => undefined);
  }
}

async function fromDocx(bytes: Uint8Array): Promise<Extraction> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { ok: true, text: value };
  } catch (error) {
    // A ZIP that is not a Word document says so; anything else is damage.
    const message = error instanceof Error ? error.message : "";
    return { ok: false, reason: /main document part/i.test(message) ? "type-mismatch" : "unreadable" };
  }
}

export async function extractDocumentText(
  bytes: Uint8Array,
  declared: DocumentExtension,
): Promise<Extraction> {
  const kind = sniff(bytes);

  let result: Extraction;
  if (declared === "pdf") {
    if (kind !== "pdf") return { ok: false, reason: kind === "unknown" ? "unreadable" : "type-mismatch" };
    result = await withTimeout(fromPdf(bytes), INGEST_LIMITS.timeoutMs).catch(
      (): Extraction => ({ ok: false, reason: "unreadable" }),
    );
  } else {
    if (kind === "cfb") return { ok: false, reason: "password-protected" };
    if (kind !== "zip") return { ok: false, reason: kind === "pdf" ? "type-mismatch" : "unreadable" };
    result = await withTimeout(fromDocx(bytes), INGEST_LIMITS.timeoutMs).catch(
      (): Extraction => ({ ok: false, reason: "unreadable" }),
    );
  }
  if (!result.ok) return result;

  const text = tidy(result.text);
  if (text.length > INGEST_LIMITS.maxCharacters) return { ok: false, reason: "too-much-text" };
  if (text.replace(/\s/g, "").length < INGEST_LIMITS.minCharacters) {
    // A DOCX this empty is not a scan, but it is just as useless to write a letter from.
    return { ok: false, reason: declared === "pdf" ? "no-text-layer" : "unreadable" };
  }
  return { ok: true, text };
}
