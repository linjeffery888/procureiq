import { NextRequest, NextResponse } from "next/server";
import { clearAllUploads, deleteUpload, listUploads, setUploadDecision } from "@/lib/uploadStore";
import { HumanAction } from "@/lib/types";

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
