import { NextRequest, NextResponse } from "next/server";
import { appendAuditEvent, listAuditEvents, clearAuditEvents, AuditEventInput } from "@/lib/auditStore";
import { AuditAction, AuditModule } from "@/lib/types";

// The audit-trail API: an append-only ledger of human touchpoints across both
// modules. ContractIQ and BudgetIQ POST one event whenever a person commits,
// approves, overrides, reopens, applies actuals, or edits thresholds. GET reads
// the whole ledger for the Audit surface and the dashboard. Thin by design: the
// store (lib/auditStore) holds the state, this route validates and appends.

export const runtime = "nodejs";

const MODULES: AuditModule[] = ["ContractIQ", "BudgetIQ"];
const ACTIONS: AuditAction[] = [
  "contract-committed",
  "invoice-approved",
  "invoice-corrected",
  "invoice-reopened",
  "budget-actuals",
  "budget-updated",
  "thresholds-changed",
  "po-updated",
];

// Coerce an arbitrary POST body into a clean AuditEventInput, rejecting anything
// that is not a recognized module/action so the ledger stays well-formed.
function toInput(body: any): AuditEventInput | null {
  if (!body || typeof body !== "object") return null;
  const module = MODULES.includes(body.module) ? (body.module as AuditModule) : null;
  const action = ACTIONS.includes(body.action) ? (body.action as AuditAction) : null;
  if (!module || !action) return null;
  const str = (v: any, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  return {
    module,
    action,
    surface: str(body.surface, module),
    actor: str(body.actor, "user"),
    actionLabel: str(body.actionLabel, action),
    subject: str(body.subject, "(unspecified)"),
    outcome: str(body.outcome),
    detail: str(body.detail),
    at: typeof body.at === "string" ? body.at : undefined,
  };
}

export async function GET() {
  return NextResponse.json({ events: await listAuditEvents() });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const input = toInput(body);
  if (!input) {
    return NextResponse.json({ error: "Unrecognized module or action." }, { status: 400 });
  }
  const event = await appendAuditEvent(input);
  return NextResponse.json({ event });
}

// DELETE clears the whole ledger (a fresh-demo reset). There is no per-event
// delete: an audit trail you can selectively edit is not an audit trail.
export async function DELETE() {
  await clearAuditEvents();
  return NextResponse.json({ events: [] });
}
