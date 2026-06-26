// The deterministic triage engine the /api/triage route falls back to when no
// ANTHROPIC_API_KEY is set, the model returns something unparseable, or the API
// errors. It runs the same deterministic core as the live path (exact PO and
// normalized-vendor linking, then the budget check), so the money decision and
// final status are identical either way. The only thing it cannot do is resolve
// a fuzzy vendor name or draft bespoke exception prose, so those invoices route
// to a human with the templated explanation finalizeMatch already produced. The
// route labels which engine ran, so the UI never implies the model did work it
// did not.

import { matchAllDeterministic } from "./matching";
import { Invoice, MatchResult, PurchaseOrder } from "./types";

export function offlineTriage(invoices: Invoice[], pos: PurchaseOrder[]): MatchResult[] {
  return matchAllDeterministic(invoices, pos);
}
