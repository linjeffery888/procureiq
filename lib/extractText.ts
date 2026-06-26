// Real document text extraction for the upload path. Turns an uploaded PDF,
// DOCX, or plain-text file into the contract text the extraction engine reads.
//
// PDF: two engines. pdf-parse runs first (imported from its inner module
// pdf-parse/lib/pdf-parse.js to skip the package index's debug block that reads
// a bundled test PDF at require time). Its bundled pdf.js is old and throws
// "bad XRef entry" on PDFs whose cross-reference table it cannot read; in
// testing that was roughly half of a real invoice batch. So on any pdf-parse
// failure or empty result we fall back to unpdf (a modern pdf.js serverless
// build) which recovers a malformed XRef by rescanning the objects. The known-
// good files still go through pdf-parse unchanged; only the broken ones reach
// the fallback. DOCX: mammoth (raw text, formatting discarded; the playbook
// reads language, not layout). TXT and unknown text types: decoded directly.
//
// The parsers are marked external in next.config so Next does not try to bundle
// their native/dynamic requires. Everything here runs in the Node runtime.

export type SupportedKind = "pdf" | "docx" | "txt";

export interface ExtractedDoc {
  text: string;
  kind: SupportedKind;
  chars: number;
  truncated: boolean;
  note: string;
}

// Keep extracted text bounded so a huge upload cannot blow the model context or
// the request payload. Matches the extract route's input ceiling.
const MAX_CHARS = 60000;

function clamp(text: string): { text: string; truncated: boolean } {
  // Normalize line endings and collapse runs of blank lines; do not strip spaces.
  const clean = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length <= MAX_CHARS) return { text: clean, truncated: false };
  return { text: clean.slice(0, MAX_CHARS), truncated: true };
}

// Decide the kind from filename extension first, then MIME type as a fallback.
export function kindFor(fileName: string, mimeType: string): SupportedKind | null {
  const name = (fileName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    name.endsWith(".txt") ||
    name.endsWith(".text") ||
    name.endsWith(".md") ||
    mime.startsWith("text/")
  ) {
    return "txt";
  }
  return null;
}

// Modern pdf.js fallback. unpdf ships a serverless pdf.js build (no native deps,
// no worker) that recovers from the malformed XRef tables pdf-parse rejects.
async function extractPdfRobust(buffer: Buffer): Promise<string> {
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdfExtract(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text || "";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Primary: unpdf (modern serverless pdf.js). It builds a FRESH document per
  // call via getDocumentProxy, so it carries no state between files, and it reads
  // the malformed XRef tables in this dataset.
  //
  // pdf-parse was the former primary, but its bundled legacy pdf.js holds state
  // across calls in a long-running server: when several PDFs are extracted in one
  // request it was observed returning a PRIOR file's text for some files (every
  // other file in a batch got the previous file's text). That cross-file leakage
  // silently mis-pairs an invoice with the wrong vendor/amount/PO downstream, so
  // pdf-parse is now only a last-resort fallback for the rare PDF unpdf cannot read.
  try {
    const text = await extractPdfRobust(buffer);
    if (text && text.trim()) return text;
  } catch {
    // unpdf threw; try pdf-parse as a fallback below.
  }
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod.default ?? mod) as (
    data: Buffer,
    options?: Record<string, unknown>
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const fn = (mammoth as unknown as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  }).extractRawText;
  const result = await fn({ buffer });
  return result.value || "";
}

// Main entry: extract text from one uploaded file's bytes. Throws a typed Error
// with a human-readable message on unsupported type or parse failure, so the
// route can return a clean per-file error without crashing the batch.
export async function extractText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractedDoc> {
  const kind = kindFor(fileName, mimeType);
  if (!kind) {
    throw new Error(
      `Unsupported file type for "${fileName}". Upload PDF, DOCX, or text.`
    );
  }

  let raw = "";
  if (kind === "pdf") {
    raw = await extractPdf(buffer);
  } else if (kind === "docx") {
    raw = await extractDocx(buffer);
  } else {
    raw = buffer.toString("utf8");
  }

  const { text, truncated } = clamp(raw);
  if (!text) {
    throw new Error(
      `No readable text found in "${fileName}". A scanned PDF may need OCR, which the prototype does not run.`
    );
  }

  return {
    text,
    kind,
    chars: text.length,
    truncated,
    note: truncated
      ? `Extracted ${MAX_CHARS.toLocaleString()} characters (file was longer and was truncated for review).`
      : `Extracted ${text.length.toLocaleString()} characters.`,
  };
}
