import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/extractText";

// File ingestion endpoint. Accepts a multipart form with one or more files
// (single file, multi-select, or a whole folder of contracts) and returns the
// extracted text per file. The client decides what to do next: ContractIQ drops
// the text into the review pane, the Knowledge module sends it on to /api/corpus
// to index. Extraction failures are reported per file so one bad PDF does not
// sink the whole batch.

export const runtime = "nodejs";
// Folder-of-contracts uploads can carry well over the old 50-file cap; extraction
// is per-file and cheap, so allow a larger batch and a longer window. The client
// chunks very large batches so any single request stays inside this budget.
export const maxDuration = 300;

const MAX_FILES = 200;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file guardrail

export interface UploadFileResult {
  fileName: string;
  ok: boolean;
  kind?: string;
  chars?: number;
  truncated?: boolean;
  note?: string;
  text?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Send files as multipart/form-data under the field name 'files'." },
      { status: 400 }
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files received. Attach at least one PDF, DOCX, or text file." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files at once (max ${MAX_FILES}). Upload in smaller batches.` }, { status: 400 });
  }

  const results: UploadFileResult[] = [];
  for (const file of files) {
    const fileName = file.name || "untitled";
    try {
      if (file.size > MAX_BYTES) {
        results.push({ fileName, ok: false, error: `File is larger than ${MAX_BYTES / (1024 * 1024)} MB.` });
        continue;
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText(buffer, fileName, file.type);
      results.push({
        fileName,
        ok: true,
        kind: extracted.kind,
        chars: extracted.chars,
        truncated: extracted.truncated,
        note: extracted.note,
        text: extracted.text,
      });
    } catch (err: any) {
      results.push({ fileName, ok: false, error: err?.message ?? "Could not read this file." });
    }
  }

  return NextResponse.json({ files: results });
}
