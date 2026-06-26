import { NextRequest, NextResponse } from "next/server";
import { saveRecord, listRecords, clearRecords } from "@/lib/recordStore";
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
  const record = await saveRecord(extraction, sourceName);
  return NextResponse.json({ record, records: await listRecords() });
}

export async function DELETE() {
  await clearRecords();
  return NextResponse.json({ records: [] });
}
