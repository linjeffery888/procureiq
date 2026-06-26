import { NextRequest, NextResponse } from "next/server";
import {
  clearBudget,
  getLiveBudget,
  removeBudgetLine,
  updateBudgetLine,
  writeBudget,
  WriteMode,
} from "@/lib/budgetStore";
import { VendorBudgetLine } from "@/lib/types";

// The LIVE vendor budget for BudgetIQ financial planning. The planning page runs
// its accrual drafts and reforecast variance against whatever this returns: the
// shipped synthetic seed until a planner brings their own budget, then the
// ingested/edited budget persisted in data/budget.json (lib/budgetStore.ts).
//
//   GET            -> { lines, source: "seed"|"ingested", updatedAt }
//   PUT  replace   -> { lines, mode:"replace" }  make these lines the whole budget
//   PUT  append    -> { lines, mode:"append"  }  union into the current live budget
//   PATCH update   -> { line }                   edit one line in place
//   PATCH remove   -> { removeVendor }           drop one line by vendor
//   DELETE         -> reset to the synthetic seed
//
// Audit logging lives on the client (the planning page logs a "budget-updated"
// event after a successful write), same as the actuals surface, so the audit
// line carries the actor and the human-readable surface label.

export const runtime = "nodejs";

// Coerce one client-supplied budget line into the stored shape. The store also
// coerces defensively, but validating here lets the route reject a body with no
// usable lines instead of silently writing an empty budget.
function toLine(input: any): VendorBudgetLine | null {
  const vendor = typeof input?.vendor === "string" ? input.vendor.trim() : "";
  if (!vendor) return null;
  const twelve = (v: unknown): number[] =>
    new Array(12).fill(0).map((_, i) => {
      const n = Number(Array.isArray(v) ? v[i] : undefined);
      return Number.isFinite(n) ? n : 0;
    });
  const monthlyExpected = twelve(input?.monthlyExpected);
  const annual = Number(input?.annualBudget);
  return {
    vendor,
    annualBudget: Number.isFinite(annual) ? annual : monthlyExpected.reduce((a, b) => a + b, 0),
    monthlyExpected,
    actualsToDate: twelve(input?.actualsToDate),
    paymentSchedule: typeof input?.paymentSchedule === "string" ? input.paymentSchedule : "",
  };
}

export async function GET() {
  return NextResponse.json(await getLiveBudget());
}

// Write the budget. Body: { lines: VendorBudgetLine[], mode?: "replace"|"append" }.
// Defaults to "replace". Returns the resulting LiveBudget.
export async function PUT(req: NextRequest) {
  let body: { lines?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with a 'lines' array." }, { status: 400 });
  }
  const raw = Array.isArray(body.lines) ? body.lines : [];
  const lines = raw.map(toLine).filter((l): l is VendorBudgetLine => l !== null);
  if (lines.length === 0) {
    return NextResponse.json({ error: "No usable budget lines in the request." }, { status: 400 });
  }
  const mode: WriteMode = body.mode === "append" ? "append" : "replace";
  return NextResponse.json(await writeBudget(lines, mode));
}

// Edit one line in place, or remove one line. Body is either { line } (upsert a
// single VendorBudgetLine) or { removeVendor: string }. Returns the LiveBudget.
export async function PATCH(req: NextRequest) {
  let body: { line?: unknown; removeVendor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof body.removeVendor === "string" && body.removeVendor.trim()) {
    return NextResponse.json(await removeBudgetLine(body.removeVendor.trim()));
  }
  const line = toLine(body.line);
  if (!line) {
    return NextResponse.json({ error: "Provide a 'line' to update or a 'removeVendor' to delete." }, { status: 400 });
  }
  return NextResponse.json(await updateBudgetLine(line));
}

// Reset to the shipped synthetic seed.
export async function DELETE() {
  return NextResponse.json(await clearBudget());
}
