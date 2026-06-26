import { NextRequest, NextResponse } from "next/server";
import { addUpload, clearAllUploads, deleteUpload, listUploads, setUploadDecision, uploadsAsLedger } from "@/lib/uploadStore";
import { checkDuplicate } from "@/lib/dedup";
import { HumanAction, Invoice } from "@/lib/types";

// The persisted upload queue for BudgetIQ invoice matching. Uploaded invoices and
// their human review decisions live on disk (lib/uploadStore.ts -> data/uploads.json)
// so an invoice that is waiting for review survives a restart and never has to be
// re-uploaded. The invoice-matching page loads these on mount, persists each
// approve/override here, and deletes uploads here.
//
// Ingestion itself (parse + persist) happens in POST /api/ingest; this route only
// reads, decides, and deletes.

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ uploads: await listUploads() });
}

// Bulk-add a set of pre-structured sample invoices to the upload queue, as if they
// had been uploaded and parsed. Backs the "Try a sample" shortcut so the queue
// loads instantly and deterministically, with no per-file model parse. Each
// invoice still runs the same deterministic dedup-on-add as a real upload, in
// order, so a -R revision later in the batch is flagged against its original. With
// replace:true the queue is cleared first so the sample loads clean. Body:
// { invoices: Invoice[], replace?: boolean }.
export async function POST(req: NextRequest) {
  let body: { invoices?: unknown; replace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an 'invoices' array." }, { status: 400 });
  }
  const invoices = Array.isArray(body.invoices) ? (body.invoices as Invoice[]) : [];
  if (invoices.length === 0) {
    return NextResponse.json({ error: "No invoices to add." }, { status: 400 });
  }
  if (body.replace === true) await clearAllUploads();
  // Add in order so the deterministic dedup check sees earlier invoices in the
  // batch: a -R revision finds its original, a re-send finds the prior receipt.
  for (const inv of invoices) {
    const duplicate = checkDuplicate(inv, await uploadsAsLedger());
    await addUpload(inv, `${inv.invoiceNumber}.pdf`, "offline-heuristic", duplicate);
  }
  return NextResponse.json({ uploads: await listUploads() });
}

// Persist a human review decision for one upload. Body: { id, decision } where
// decision is "approved" | "override" | null (null reopens / clears the decision).
export async function PATCH(req: NextRequest) {
  let body: { id?: unknown; decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an 'id' and a 'decision'." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "An upload 'id' is required." }, { status: 400 });
  }
  const decision =
    body.decision === "approved" || body.decision === "override" ? (body.decision as HumanAction) : null;
  const upload = await setUploadDecision(id, decision);
  if (!upload) {
    return NextResponse.json({ error: `No upload with id "${id}".` }, { status: 404 });
  }
  return NextResponse.json({ upload });
}

// Delete one upload (?id=<id>) or, with no id, clear the whole queue. Deleting also
// removes the invoice from the receipt history, so re-uploading it later is not
// falsely flagged as a duplicate. Returns the remaining uploads.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    await deleteUpload(id);
  } else {
    await clearAllUploads();
  }
  return NextResponse.json({ uploads: await listUploads() });
}
