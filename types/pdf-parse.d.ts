// pdf-parse ships no type declarations. We import the inner module directly
// (pdf-parse/lib/pdf-parse.js) to avoid the package index's debug block that
// reads a bundled test PDF at require time. Declare both entry points.

interface PdfParseResult {
  text: string;
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  version: string;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "pdf-parse" {
  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export default pdfParse;
}
