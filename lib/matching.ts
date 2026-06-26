// The deterministic core of invoice/PO matching. This is the system of record
// for the money decision: whether an invoice links to a PO and whether it fits
// the remaining budget is decided here, by rules, with a traceable reason. AI
// (in the route) may PROPOSE a fuzzy vendor/PO link for invoices this core
// cannot resolve, but the budget check and the final status are always computed
// here, so every cleared invoice is auditable.

import { AuditStep, DecisionSource, Invoice, MatchResult, MatchStatus, PurchaseOrder } from "./types";

// Confidence at or above this auto-clears; between FLOOR and this routes to a
// human for a quick confirm; below FLOOR we do not trust the link at all.
export const AUTO_CLEAR_CONFIDENCE = 0.85;
export const REVIEW_FLOOR_CONFIDENCE = 0.6;

const SUFFIX_TOKENS = new Set(["inc", "llc", "ltd", "co", "corp", "company", "the"]);

// Normalize a vendor name for deterministic comparison: lowercase, drop
// punctuation, drop corporate suffix tokens, collapse whitespace. This resolves
// "Helix Analytics, Inc." to "Helix Analytics" but deliberately NOT
// "BioReliance QC" to "BioReliance QC Labs" (that genuine ambiguity is the AI's
// job, not a rule's).
export function normalizeVendor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUFFIX_TOKENS.has(t))
    .join(" ")
    .trim();
}

export interface Resolution {
  po: PurchaseOrder | null;
  source: DecisionSource;   // deterministic when a rule found it, ai when proposed
  method: string;           // "exact PO" | "normalized vendor" | "po vendor mismatch" | "AI" | "none"
  confidence: number;       // 0..1
  reason: string;           // plain-English, becomes an audit step
  vendorMismatch?: boolean; // cited PO exists but belongs to a different vendor (wrong PO)
}

// Try to link an invoice to a PO using rules only. Returns a null po when no
// exact or normalized match exists (the case the AI is asked to attempt).
export function resolveDeterministic(inv: Invoice, pos: PurchaseOrder[]): Resolution {
  if (inv.poNumberClaimed) {
    const byClaim = pos.find((p) => p.poNumber === inv.poNumberClaimed);
    if (byClaim) {
      // The cited PO exists, but confirm it actually belongs to this vendor before
      // trusting it. Ben's exact failure mode: a vendor prints the wrong PO number
      // (the PO says Salesforce, the invoice is from Microsoft), or AP routes a
      // no-PO invoice to the wrong bucket. A cited PO whose vendor does not match
      // the invoice is NOT a clean match; it is a wrong-PO exception for a human.
      const claimNorm = normalizeVendor(byClaim.vendor);
      const invNorm = normalizeVendor(inv.vendor);
      if (claimNorm && invNorm && claimNorm !== invNorm) {
        return {
          po: byClaim,
          source: "deterministic",
          method: "po vendor mismatch",
          confidence: 0.3,
          vendorMismatch: true,
          reason: `Invoice cites ${byClaim.poNumber}, but that PO belongs to ${byClaim.vendor}, not "${inv.vendor}". Likely the wrong PO number on the invoice.`,
        };
      }
      return { po: byClaim, source: "deterministic", method: "exact PO", confidence: 0.99, reason: `Invoice cites ${byClaim.poNumber}; found in Points Purchasing, and the PO vendor matches.` };
    }
  }
  const invNorm = normalizeVendor(inv.vendor);
  const normMatches = pos.filter((p) => normalizeVendor(p.vendor) === invNorm);
  if (normMatches.length === 1) {
    const po = normMatches[0];
    return { po, source: "deterministic", method: "normalized vendor", confidence: 0.9, reason: `No PO on invoice; vendor "${inv.vendor}" normalized to ${po.vendor} (${po.poNumber}), the sole open PO.` };
  }
  return { po: null, source: "deterministic", method: "none", confidence: 0.2, reason: `No exact PO and no unique normalized vendor match for "${inv.vendor}".` };
}

// Given a resolution (from a rule or proposed by AI), run the deterministic
// budget check and produce the final audited result.
export function finalizeMatch(inv: Invoice, res: Resolution, aiAttempted: boolean): MatchResult {
  const audit: AuditStep[] = [];

  // Wrong PO: the invoice cited a real PO that belongs to a different vendor. The
  // budget check would be meaningless against the wrong PO, so route straight to a
  // human to reassign. We surface the cited PO so the reviewer sees exactly what
  // was wrong.
  if (res.po && res.vendorMismatch) {
    audit.push({ label: "PO link", source: "deterministic", detail: res.reason });
    return {
      invoice: inv,
      matchedPo: res.po,
      status: "review",
      confidence: res.confidence,
      resolutionSource: "deterministic",
      explanation: `Cited PO ${res.po.poNumber} belongs to ${res.po.vendor}, not ${inv.vendor}. The PO number is likely wrong; do not approve against this PO.`,
      suggestedResolution: `Find the correct open PO for ${inv.vendor}, or ask the vendor to reissue the invoice with the right PO number.`,
      audit,
      needsHuman: true,
    };
  }

  // Step 1: how the PO link was established.
  if (res.po && res.source === "ai") {
    audit.push({ label: "Vendor resolution", source: "ai", detail: res.reason, confidence: res.confidence });
  } else if (res.po && res.method === "exact PO") {
    audit.push({ label: "PO link", source: "deterministic", detail: res.reason });
  } else if (res.po) {
    audit.push({ label: "Vendor resolution", source: "deterministic", detail: res.reason });
  } else {
    audit.push({ label: "Vendor resolution", source: "deterministic", detail: res.reason });
    if (aiAttempted) {
      audit.push({ label: "Vendor resolution", source: "ai", detail: "AI triage found no plausible PO for this vendor.", confidence: res.confidence });
    }
  }

  // No PO could be linked: route to manual sourcing.
  if (!res.po) {
    return {
      invoice: inv,
      matchedPo: null,
      status: "no_po",
      confidence: res.confidence,
      resolutionSource: aiAttempted ? "ai" : "deterministic",
      explanation: `No open PO found for ${inv.vendor}. Needs manual sourcing before approval.`,
      suggestedResolution: `Source a PO for ${inv.vendor}, or confirm this is a new vendor and onboard it.`,
      audit,
      needsHuman: true,
    };
  }

  // Step 2: the money decision is always deterministic.
  const over = inv.amount > res.po.remaining;
  audit.push({
    label: "Budget check",
    source: "deterministic",
    detail: `${fmt(inv.amount)} vs ${fmt(res.po.remaining)} remaining on ${res.po.poNumber} (${res.po.workOrder}): ${over ? "over" : "within"} budget.`,
  });

  if (over) {
    return {
      invoice: inv,
      matchedPo: res.po,
      status: "over_budget",
      confidence: res.confidence,
      resolutionSource: res.source,
      explanation: `${fmt(inv.amount)} exceeds the ${fmt(res.po.remaining)} remaining on ${res.po.poNumber}. Likely the wrong bucket or a missing PO amendment.`,
      suggestedResolution: `Confirm the correct PO and work order, or raise a PO amendment, before approving.`,
      audit,
      needsHuman: true,
    };
  }

  const aiNote = res.source === "ai" ? " Resolved by AI from a non-standard vendor name." : "";

  if (res.confidence >= AUTO_CLEAR_CONFIDENCE) {
    return {
      invoice: inv,
      matchedPo: res.po,
      status: "matched",
      confidence: res.confidence,
      resolutionSource: res.source,
      explanation: `Matched to ${res.po.poNumber} / ${res.po.workOrder}, within remaining budget.${aiNote}`,
      suggestedResolution: "",
      audit,
      needsHuman: false,
    };
  }

  // Resolved within budget but not confident enough to auto-clear.
  return {
    invoice: inv,
    matchedPo: res.po,
    status: "review",
    confidence: res.confidence,
    resolutionSource: res.source,
    explanation: `Resolved to ${res.po.poNumber} at medium confidence (${Math.round(res.confidence * 100)}%), within budget. A quick human confirm before clearing.`,
    suggestedResolution: `Confirm the proposed PO link to ${res.po.poNumber}, then clear.`,
    audit,
    needsHuman: true,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Convenience used by the offline engine and as the deterministic baseline:
// resolve every invoice with rules only (no AI), then finalize.
export function matchAllDeterministic(invoices: Invoice[], pos: PurchaseOrder[]): MatchResult[] {
  return invoices.map((inv) => finalizeMatch(inv, resolveDeterministic(inv, pos), false));
}

export function statusCounts(results: MatchResult[]): Record<MatchStatus, number> {
  const counts: Record<MatchStatus, number> = { matched: 0, review: 0, over_budget: 0, no_po: 0 };
  for (const r of results) counts[r.status] += 1;
  return counts;
}
