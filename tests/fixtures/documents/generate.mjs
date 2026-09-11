// Generates the real documents the ingestion tests read (tickets 15 and 19). Each is a genuine
// file of its kind, not a stub with the right extension:
//
//   resume.pdf               a one-page PDF with a text layer
//   scan.pdf                 a one-page PDF whose only content is an image — no text layer
//   locked.pdf               a PDF encrypted with the standard security handler (RC4, R2) and a
//                            user password, so it cannot be opened without one
//   long.pdf                 21 pages, one past the page cap
//   resume.docx              a minimal but complete Word document
//   locked.docx              resume.docx encrypted by `officecrypto-tool` (an OLE2 container)
//   pdf-named-as.docx        resume.pdf's bytes under a .docx name
//
// Run from the repository root:
//   npm install --no-save --prefix <tools-dir> officecrypto-tool jszip
//   FIXTURE_TOOLS=<tools-dir>/node_modules node tests/fixtures/documents/generate.mjs
//
// The output is committed; regenerate only to change a fixture.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tools = process.env.FIXTURE_TOOLS;
if (!tools) throw new Error("Set FIXTURE_TOOLS to a node_modules holding officecrypto-tool and jszip");
const require = createRequire(join(tools, "noop.js"));
const JSZip = require("jszip");
const officeCrypto = require("officecrypto-tool");

const latin1 = (text) => Buffer.from(text, "latin1");

/** Assembles a PDF from object bodies (strings or Buffers), computing the xref offsets. */
function buildPdf(objects, trailerExtra = "") {
  const parts = [latin1("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let length = parts[0].length;
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      latin1(`${index + 1} 0 obj\n`),
      Buffer.isBuffer(body) ? body : latin1(body),
      latin1("\nendobj\n"),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>`,
    "startxref",
    String(length),
    "%%EOF",
    "",
  ].join("\n");
  parts.push(latin1(xref));
  return Buffer.concat(parts);
}

const stream = (dict, data) =>
  Buffer.concat([latin1(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, latin1("\nendstream")]);

const RESUME_LINES = [
  "Sam Rivera - Senior Product Designer",
  "Austin, TX - sam.rivera@example.com",
  "Eight years designing analytics and onboarding for B2B software.",
  "Meridian Labs: led the redesign of the reporting surface; activation up 18 percent.",
  "Fernwood: built the referral loop and the pricing experiments behind it.",
  "Skills: interaction design, design systems, research synthesis, prototyping.",
];

function textContent(lines) {
  const ops = ["BT", "/F1 12 Tf", "72 720 Td"];
  lines.forEach((line, index) => {
    if (index > 0) ops.push("0 -18 Td");
    ops.push(`(${line.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj`);
  });
  ops.push("ET");
  return latin1(ops.join("\n"));
}

const FONT = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

function textPdf(lines) {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    stream("", textContent(lines)),
    FONT,
  ]);
}

function scanPdf() {
  // An 8x8 greyscale image stretched across the page: pixels, no text operators at all.
  const pixels = Buffer.alloc(64, 0).map((_, i) => ((i >> 3) + (i % 8)) % 2 === 0 ? 40 : 220);
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>",
    stream("", latin1("q 468 0 0 648 72 72 cm /Im1 Do Q")),
    stream("/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8", pixels),
  ]);
}

function longPdf(pages) {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`];
  const fontRef = 3 + pages * 2;
  for (let i = 0; i < pages; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`,
    );
    objects.push(stream("", textContent([`Page ${i + 1} of a portfolio that should not be a resume.`])));
  }
  objects.push(FONT);
  return buildPdf(objects);
}

// --- PDF standard security handler, revision 2 (40-bit RC4), per the PDF 1.4 reference ----------

const PAD = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);
const md5 = (...chunks) => {
  const hash = createHash("md5");
  for (const chunk of chunks) hash.update(chunk);
  return hash.digest();
};
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n += 1) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}
const padded = (password) => Buffer.concat([latin1(password), PAD]).subarray(0, 32);

function lockedPdf(userPassword, ownerPassword) {
  const id = md5(latin1("trailhead-locked-fixture"));
  const permissions = -44;
  const p = Buffer.alloc(4);
  p.writeInt32LE(permissions);

  const ownerValue = rc4(md5(padded(ownerPassword)).subarray(0, 5), padded(userPassword));
  const fileKey = md5(padded(userPassword), ownerValue, p, id).subarray(0, 5);
  const userValue = rc4(fileKey, PAD);

  const objectKey = (num) =>
    md5(fileKey, Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0])).subarray(0, 10);

  const content = rc4(objectKey(4), textContent(RESUME_LINES));
  return buildPdf(
    [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      stream("", content),
      FONT,
      `<< /Filter /Standard /V 1 /R 2 /O <${ownerValue.toString("hex")}> /U <${userValue.toString("hex")}> /P ${permissions} >>`,
    ],
    `/Encrypt 6 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>] `,
  );
}

// --- DOCX ------------------------------------------------------------------------------------------

async function docx(lines) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
  );
  const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`).join("") +
      "</w:body></w:document>",
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const write = (name, bytes) => {
  writeFileSync(join(here, name), bytes);
  console.log(`${name}\t${bytes.length} bytes`);
};

const resumePdf = textPdf(RESUME_LINES);
write("resume.pdf", resumePdf);
write("scan.pdf", scanPdf());
write("locked.pdf", lockedPdf("trailhead", "owner-secret"));
write("long.pdf", longPdf(21));
const resumeDocx = await docx(RESUME_LINES);
write("resume.docx", resumeDocx);
write("locked.docx", await officeCrypto.encrypt(resumeDocx, { password: "trailhead" }));
write("pdf-named-as.docx", resumePdf);
