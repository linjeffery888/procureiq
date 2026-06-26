// Client-side helpers for the audit trail. logAudit fires one POST per human
// touchpoint and never blocks the UI: a failed write must not stop a person from
// approving an invoice or committing a contract, so it swallows errors. The two
// modules call this from their decision handlers. auditToSheet shapes the ledger
// for lib/export so the Audit surface and the dashboard can hand a reviewer a
// real spreadsheet.

import { AuditEvent, AuditAction, AuditModule } from "./types";
import { Sheet } from "./export";

export interface LogAuditInput {
  module: AuditModule;
  action: AuditAction;
  surface: string;
  actor: string;
  actionLabel: string;
  subject: string;
  outcome?: string;
  detail?: string;
}

// Fire-and-forget. Returns the stored event on success, or null on any failure;
// callers ignore the result. Guards on `window` so an accidental server-side
// call is a no-op rather than a crash.
export async function logAudit(input: LogAuditInput): Promise<AuditEvent | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "", detail: "", ...input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.event as AuditEvent) ?? null;
  } catch {
    return null;
  }
}

// Shorten an ISO timestamp to a compact, sortable "YYYY-MM-DD HH:MM" for the
// spreadsheet and the table. Falls back to the raw string if parsing fails.
export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// One sheet, header row first, ready for exportSheets. Column order matches the
// on-screen table so the downloaded file reads the same as the UI.
export function auditToSheet(events: AuditEvent[]): Sheet {
  const header = ["When", "Module", "Surface", "Actor", "Action", "Subject", "Outcome", "Detail"];
  const rows: (string | number)[][] = [header];
  for (const e of events) {
    rows.push([
      formatAuditTime(e.at),
      e.module,
      e.surface,
      e.actor,
      e.actionLabel,
      e.subject,
      e.outcome,
      e.detail,
    ]);
  }
  return { name: "Audit trail", rows };
}
