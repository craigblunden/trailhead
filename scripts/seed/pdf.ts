/**
 * The seed's Documents are real PDFs with a text layer — the same construction as
 * `tests/fixtures/documents/generate.mjs` — so downloading one opens a readable page, and the text
 * stored on its row is exactly what the app's own extraction would have read at upload
 * (`tests/seed/pdf.test.ts` holds the two together).
 */

const latin1 = (text: string) => Buffer.from(text, "latin1");

/** Assembles a PDF from object bodies, computing the xref offsets. */
function buildPdf(objects: Buffer[]): Buffer {
  const parts = [latin1("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let length = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([latin1(`${index + 1} 0 obj\n`), body, latin1("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(length),
    "%%EOF",
    "",
  ].join("\n");
  parts.push(latin1(xref));
  return Buffer.concat(parts);
}

/** 10pt Helvetica between 64pt margins, 15pt apart from the top down. */
const PAGE = { maxLineChars: 90, maxLines: 40 } as const;

/**
 * Helvetica's built-in encoding draws printable ASCII faithfully and nothing else: a "—" would come
 * back from extraction as something the row's text does not say. A line past the margin or the
 * bottom of the page would be cut off in the file while the row still held it.
 */
function assertDrawable(lines: readonly string[]) {
  if (lines.length > PAGE.maxLines) {
    throw new Error(`A seed PDF holds at most ${PAGE.maxLines} lines; this one has ${lines.length}`);
  }
  for (const line of lines) {
    if (!/^[\x20-\x7e]*$/.test(line)) throw new Error(`Seed PDF text must be printable ASCII: "${line}"`);
    if (line.length > PAGE.maxLineChars) {
      throw new Error(`Seed PDF line too wide (over ${PAGE.maxLineChars} characters): "${line}"`);
    }
  }
}

function contentStream(lines: readonly string[]): Buffer {
  const ops = ["BT", "/F1 10 Tf", "64 740 Td"];
  lines.forEach((line, index) => {
    if (index > 0) ops.push("0 -15 Td");
    ops.push(`(${line.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj`);
  });
  ops.push("ET");
  const data = latin1(ops.join("\n"));
  return Buffer.concat([latin1(`<< /Length ${data.length} >>\nstream\n`), data, latin1("\nendstream")]);
}

/** A one-page Letter PDF drawing `lines` top to bottom in Helvetica. */
export function textPdf(lines: readonly string[]): Uint8Array {
  assertDrawable(lines);
  return new Uint8Array(
    buildPdf([
      latin1("<< /Type /Catalog /Pages 2 0 R >>"),
      latin1("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      latin1(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      ),
      contentStream(lines),
      // WinAnsi, not the font's built-in StandardEncoding, which draws ' and ` as curly quotes.
      latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    ]),
  );
}

/** The text a Document's row holds for a file built from `lines`. */
export function documentText(lines: readonly string[]): string {
  return lines.join("\n");
}
