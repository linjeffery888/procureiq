import { NextRequest, NextResponse } from "next/server";
import {
  clearBudgetActuals,
  deleteBudgetActual,
  listBudgetActuals,
  upsertBudgetActuals,
} from "@/lib/budgetActualsStore";
import { IngestEngine, PersistedBudgetActual } from "@/lib/types";

// Persisted finance actuals for BudgetIQ financial planning. The planner uploads
// the quarterly actuals export once; each figure that matches a budget line is
// persisted here (lib/budgetActualsStore.ts -> data/budget-actuals.json) so the
// accrual drafts and reforecast variance survive a reload / restart instead of
// needing a re-upload. The page loads these on mount, persists each matched
// actual after parsing, and deletes them here.

export const runtime = "nodejs";

// Coerce one client-supplied actual into the stored shape, dropping anything
// extra and ignoring entries without a usable vendor key + amount.
function toActual(input: any): PersistedBudgetActual | null {
  const vendorKey = typeof input?.vendorKey === "string" ? input.vendorKey.trim() : "";
  const amount = typeof input?.amount === "number" && Number.isFinite(input.amount) ? input.amount : null;
  if (!vendorKey || amount == null) return null;
  const engine: IngestEngine = input?.engine === "live" ? "live" : "offline-heuristic";
  return {
    vendorKey,
    vendor: typeof input?.vendor === "string" ? input.vendor : vendorKey,
    amount,
    period: typeof input?.period === "string" ? input.period : null,
    note: typeof input?.note === "string" ? input.note : "",
    sourceName: typeof input?.sourceName === "string" ? input.sourceName : "uploaded export",
    engine,
    uploadedAt: typeof input?.uploadedAt === "string" ? input.uploadedAt : new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json({ actuals: await listBudgetActuals() });
}

// Upsert one or more matched actuals. Body: { actuals: PersistedBudgetActual[] }.
export async function PUT(req: NextRequest) {
  let body: { actuals?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an 'actuals' array." }, { status: 400 });
  }
  const raw = Array.isArray(body.actuals) ? body.actuals : [];
  const entries = raw.map(toActual).filter((a): a is PersistedBudgetActual => a !== null);
  const actuals = entries.length ? await upsertBudgetActuals(entries) : await listBudgetActuals();
  return NextResponse.json({ actuals });
}

// Delete one actual (?vendorKey=<key>) or, with no key, clear them all. Returns
// the remaining actuals.
export async function DELETE(req: NextRequest) {
  const vendorKey = req.nextUrl.searchParams.get("vendorKey");
  if (vendorKey) {
    await deleteBudgetActual(vendorKey);
  } else {
    await clearBudgetActuals();
  }
  return NextResponse.json({ actuals: await listBudgetActuals() });
}
