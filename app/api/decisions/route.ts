import { NextRequest, NextResponse } from "next/server";
import { clearDecisions, listDecisions, setDecision } from "@/lib/decisionStore";
import { HumanAction, StoredDecision } from "@/lib/types";

// Persisted human review dispositions for the invoice-matching exception queue,
// keyed by invoice number. The page loads these on mount and overlays them onto
// the triage result so an approve / manual correction survives navigation and
// restart, for both seeded and uploaded invoices. See lib/decisionStore.ts.

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ decisions: await listDecisions() });
}

// Set or clear one disposition. Body: { invoiceNumber, decision, manualPo?,
// manualNote? } where decision is "approved" | "override" | null (null reopens).
export async function PUT(req: NextRequest) {
  let body: { invoiceNumber?: unknown; decision?: unknown; manualPo?: unknown; manualNote?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an 'invoiceNumber' and a 'decision'." }, { status: 400 });
  }
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  if (!invoiceNumber) {
    return NextResponse.json({ error: "An 'invoiceNumber' is required." }, { status: 400 });
  }
  const decision: HumanAction | null =
    body.decision === "approved" || body.decision === "override" ? (body.decision as HumanAction) : null;
  const value: StoredDecision | null =
    decision === null
      ? null
      : {
          decision,
          ...(typeof body.manualPo === "string" && body.manualPo ? { manualPo: body.manualPo } : {}),
          ...(typeof body.manualNote === "string" && body.manualNote ? { manualNote: body.manualNote } : {}),
        };
  return NextResponse.json({ decisions: await setDecision(invoiceNumber, value) });
}

export async function DELETE() {
  await clearDecisions();
  return NextResponse.json({ decisions: {} });
}
