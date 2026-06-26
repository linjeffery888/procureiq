// Batch dedup for the invoice-matching queue. Where lib/invoiceLedger + the
// ingest route catch a duplicate AS each invoice is uploaded, this catches
// duplicates ACROSS the current triage batch: two rows in the same queue that
// share an invoice number (the corpus duplicate_invoice case), a re-send under a
// new number, or a -R / -CR that supersedes another row.
//
// Scope is intentionally batch-internal: each invoice is checked only against the
// invoices BEFORE it in the same batch, not against the persistent ledger. The
// uploaded invoices were already recorded in that ledger at ingest time, so
// checking against it here would make every upload match itself. The two layers
// are complementary: ingest-time dedup vs the receipt history, batch dedup vs the
// rest of the queue on screen.
//
// Like the rest of the money path this is deterministic and only ever FLAGS. A
// payment-risk duplicate (exact / same-number / near) is forced into the
// exception queue with the dedup verdict leading its explanation and audit; a
// revision or credit is attached as context but does not block.

import { checkDuplicate, LedgerEntry } from "./dedup";
import { AuditStep, MatchResult } from "./types";

export function applyBatchDedup(results: MatchResult[]): MatchResult[] {
  const seen: LedgerEntry[] = [];
  return results.map((r) => {
    const dup = checkDuplicate(r.invoice, seen);
    seen.push({
      invoiceNumber: r.invoice.invoiceNumber,
      vendor: r.invoice.vendor,
      amount: r.invoice.amount,
      poNumberClaimed: r.invoice.poNumberClaimed,
      receivedDate: r.invoice.receivedDate,
    });

    if (dup.kind === "none") return r;

    const stepLabel =
      dup.kind === "credit-memo" ? "Credit memo" : dup.kind === "revision" ? "Revision" : "Duplicate check";
    const dupStep: AuditStep = { label: stepLabel, source: "deterministic", detail: dup.recommendation };
    // Dedup is the first gate, so it leads the trail.
    const audit = [dupStep, ...r.audit];

    if (dup.isDuplicate) {
      // Force into the exception queue. The PO-match explanation stays factual
      // (it may genuinely match a PO and fit budget); the duplicate is surfaced as
      // its own callout, audit step, and suggested resolution so the reason it is
      // held is unambiguous.
      return {
        ...r,
        duplicate: dup,
        audit,
        needsHuman: true,
        suggestedResolution: r.suggestedResolution || dup.recommendation,
      };
    }

    // Revision / credit: legitimate, surfaced as context but not a payment block.
    return { ...r, duplicate: dup, audit };
  });
}
