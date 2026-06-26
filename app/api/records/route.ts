import { NextRequest, NextResponse } from "next/server";
import { saveRecord, listRecords, clearRecords, deleteRecord, RecordClearance } from "@/lib/recordStore";
import { ContractExtraction } from "@/lib/types";

// The shared-record API: the one place the two modules meet. ContractIQ POSTs a
// committed extraction here (the attorney has confirmed the first pass); BudgetIQ
// GETs the records to use as its match key and accrual basis. Thin by design: the
// store (lib/recordStore) holds the state, this route just validates and commits.

export const runtime = "nodejs";

// Coerce an arbitrary commit body into the ContractExtraction spine, dropping
// anything extra (like the _meta block) so the store holds a clean record.
function toExtraction(input: any): ContractExtraction {
  return {
    vendor: input?.vendor ?? null,
    counterpartyType: input?.counterpartyType ?? null,
    totalValue: typeof input?.totalValue === "number" ? input.totalValue : null,
    currency: input?.currency ?? null,
    startDate: input?.startDate ?? null,
    endDate: input?.endDate ?? null,
    termMonths: typeof input?.termMonths === "number" ? input.termMonths : null,
    paymentSchedule: input?.paymentSchedule ?? null,
    autoRenewal: typeof input?.autoRenewal === "boolean" ? input.autoRenewal : null,
    governingLaw: input?.governingLaw ?? null,
    terms: Array.isArray(input?.terms) ? input.terms : [],
    findings: Array.isArray(input?.findings) ? input.findings : [],
    summary: typeof input?.summary === "string" ? input.summary : "",
    contractId: typeof input?.contractId === "string" ? input.contractId : null,
    parentReference: input?.parentReference ?? null,
  };
}

// Coerce the commit body's clearance block into the stored shape, or null if the
// caller did not send one (legacy / direct commits).
function toClearance(input: any): RecordClearance | null {
  if (!input || typeof input !== "object") return null;
  const status = input.status === "human-accepted" ? "human-accepted" : input.status === "clean-pass" ? "clean-pass" : null;
  if (!status) return null;
  const n = (v: any) => (typeof v === "number" && v >= 0 ? Math.floor(v) : 0);
  return { status, flags: n(input.flags), reviews: n(input.reviews), accepted: n(input.accepted), dismissed: n(input.dismissed) };
}

export async function GET() {
  return NextResponse.json({ records: await listRecords() });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an extraction field." }, { status: 400 });
  }
  const source = body?.extraction ?? body;
  if (!source || (source.vendor == null && source.summary == null)) {
    return NextResponse.json({ error: "Nothing to commit: run a review first." }, { status: 400 });
  }
  const extraction = toExtraction(source);
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName : "reviewed contract";
  const clearance = toClearance(body?.clearance);
  const record = await saveRecord(extraction, sourceName, clearance);
  return NextResponse.json({ record, records: await listRecords() });
}

// DELETE removes one record when ?id= is supplied (undo a mistaken commit), or
// clears the whole store when no id is given.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const removed = await deleteRecord(id);
    if (!removed) {
      return NextResponse.json({ error: `No record with id ${id}.`, records: await listRecords() }, { status: 404 });
    }
    return NextResponse.json({ records: await listRecords() });
  }
  await clearRecords();
  return NextResponse.json({ records: [] });
}
