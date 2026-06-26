// Deterministic duplicate-invoice detection for BudgetIQ ingestion.
//
// Ben's pain (discovery): an AP team keys hundreds of invoices a month into
// Points Purchasing by hand, and a re-sent or double-submitted invoice can slip
// through and get paid twice. This is the guard against that: every invoice, as
// it is ingested, is checked against the running receipt ledger BEFORE it joins
// the matching queue.
//
// Like the rest of BudgetIQ's money path, this is a RULE, not the model. The
// decision is deterministic and auditable, and it only ever FLAGS for a human;
// it never voids or pays on its own. It also tells apart the three look-alikes
// the corpus contains, which a naive "same number" check would confuse:
//
//   - exact duplicate      same invoice number + same amount  -> hold, double pay
//   - same number          same number, different amount      -> hold, needs eyes
//   - revision (-R)        supersedes a prior invoice          -> not a payment risk
//   - credit memo (-CR, <0) a credit against a prior invoice    -> not a duplicate
//
// Pure module: no I/O, no globals, no model. Safe to unit-test in isolation and
// to reuse from the batch matcher later, not just the single-invoice ingest path.

import { Invoice } from "./types";

export type DuplicateKind =
  | "none"
  | "exact-duplicate"
  | "same-number"
  | "revision"
  | "credit-memo";

// A prior ledger entry the candidate collides with. Kept light so the engine
// stays decoupled from however the ledger is stored.
export interface LedgerEntry {
  invoiceNumber: string;
  vendor: string;
  amount: number;
  poNumberClaimed: string | null;
  receivedDate: string;
}

export interface DuplicateMatch {
  invoiceNumber: string;
  vendor: string;
  amount: number;
  receivedDate: string;
  detail: string; // plain-English why this prior entry matched
}

export interface DuplicateCheck {
  isDuplicate: boolean; // true only for the payment-risk kinds (exact / same-number / near)
  kind: DuplicateKind;
  confidence: number; // 0..1, deterministic confidence in `kind`
  matches: DuplicateMatch[]; // prior ledger entries this invoice relates to
  recommendation: string; // next step for the human
  source: "deterministic"; // dedup is always a rule, never AI
}

const AMOUNT_EPSILON = 0.01;

// Uppercase + collapse whitespace. Hyphens are meaningful (they carry the -R /
// -CR suffixes), so they are preserved.
export function normalizeInvoiceNumber(n: string | null | undefined): string {
  return (n || "").toUpperCase().replace(/\s+/g, "").trim();
}

// Strip a revision / credit suffix (-R, -REV, -CR, -CM, optionally numbered) and
// any leaked file-copy suffix (_8) to recover the underlying base invoice number.
export function baseInvoiceNumber(n: string | null | undefined): string {
  return normalizeInvoiceNumber(n)
    .replace(/_\d+$/, "")
    .replace(/-(R|REV|CR|CM)\d*$/i, "")
    .trim();
}

// Vendor normalization mirrors recordStore.normalizeVendor so "Helix Analytics,
// Inc." and "Helix Analytics" are the same vendor. Kept local to keep this
// module pure and free of store coupling.
function normalizeVendor(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCreditNumber(num: string): boolean {
  return /-(CR|CM)\d*$/i.test(num);
}

function isRevisionNumber(num: string): boolean {
  return /-(R|REV)\d*$/i.test(num);
}

function toMatch(e: LedgerEntry, detail: string): DuplicateMatch {
  return {
    invoiceNumber: e.invoiceNumber,
    vendor: e.vendor,
    amount: e.amount,
    receivedDate: e.receivedDate,
    detail,
  };
}

const NONE: DuplicateCheck = {
  isDuplicate: false,
  kind: "none",
  confidence: 1,
  matches: [],
  recommendation: "No prior receipt matches this invoice. Safe to queue for matching.",
  source: "deterministic",
};

/**
 * Check one candidate invoice against the already-seen ledger. Deterministic and
 * order-independent over the ledger. The candidate is NOT assumed to be in the
 * ledger yet (the caller records it after checking).
 */
export function checkDuplicate(candidate: Invoice, ledger: LedgerEntry[]): DuplicateCheck {
  const cNum = normalizeInvoiceNumber(candidate.invoiceNumber);
  const cBase = baseInvoiceNumber(candidate.invoiceNumber);
  const cVendor = normalizeVendor(candidate.vendor);
  const credit = isCreditNumber(cNum) || candidate.amount < 0;
  const revision = !credit && isRevisionNumber(cNum);

  // 1. Exact invoice-number collision: the strongest signal of a double payment.
  //    A reused number is a red flag even across vendors, so vendor is not
  //    required to match (the corpus reissues the same number under a new vendor).
  const exact = ledger.filter((e) => normalizeInvoiceNumber(e.invoiceNumber) === cNum);
  if (exact.length > 0) {
    const amountHit = exact.find((e) => Math.abs(e.amount - candidate.amount) < AMOUNT_EPSILON);
    if (amountHit) {
      const crossVendor = normalizeVendor(amountHit.vendor) !== cVendor;
      return {
        isDuplicate: true,
        kind: "exact-duplicate",
        confidence: 0.99,
        matches: exact.map((e) =>
          toMatch(
            e,
            `Same invoice number and amount already received${
              normalizeVendor(e.vendor) !== cVendor ? ` (prior under "${e.vendor}")` : ""
            }.`,
          ),
        ),
        recommendation: crossVendor
          ? "Hold payment. This invoice number and amount were already received under a different vendor name, a classic double-submission. A human confirms before it clears."
          : "Hold payment. This invoice number and amount were already received. A human confirms this is not a double payment before it clears.",
        source: "deterministic",
      };
    }
    return {
      isDuplicate: true,
      kind: "same-number",
      confidence: 0.9,
      matches: exact.map((e) =>
        toMatch(e, `Same invoice number already received, but a different amount (${e.amount}).`),
      ),
      recommendation:
        "Hold for review. The same invoice number was already received at a different amount, which can be a silent revision or a keying error. A human reconciles the two.",
      source: "deterministic",
    };
  }

  // 2. Credit memo: a credit against a prior invoice, not a duplicate. Linked to
  //    the base invoice when that base was already received.
  if (credit) {
    const baseHits = ledger.filter((e) => baseInvoiceNumber(e.invoiceNumber) === cBase);
    return {
      isDuplicate: false,
      kind: "credit-memo",
      confidence: baseHits.length ? 0.95 : 0.6,
      matches: baseHits.map((e) => toMatch(e, `Original invoice this credit applies against.`)),
      recommendation: baseHits.length
        ? `Credit memo. Apply against ${baseHits[0].invoiceNumber} rather than paying it. Not a duplicate.`
        : "Credit memo (negative amount). Not a duplicate; route to AP to apply the credit.",
      source: "deterministic",
    };
  }

  // 3. Revision: a -R invoice supersedes the prior version. Not a payment risk on
  //    its own, but the prior version should be superseded so both are not paid.
  if (revision) {
    const baseHits = ledger.filter(
      (e) => baseInvoiceNumber(e.invoiceNumber) === cBase && !isRevisionNumber(normalizeInvoiceNumber(e.invoiceNumber)),
    );
    return {
      isDuplicate: false,
      kind: "revision",
      confidence: baseHits.length ? 0.9 : 0.5,
      matches: baseHits.map((e) => toMatch(e, `Prior version this revision supersedes.`)),
      recommendation: baseHits.length
        ? `Revised invoice. It supersedes ${baseHits[0].invoiceNumber}; make sure the prior version is not also paid.`
        : "Revised invoice (-R). No prior version on file yet; treat as the current version.",
      source: "deterministic",
    };
  }

  // Note: we deliberately do NOT flag "same vendor + same amount, different
  // number" as a duplicate. Recurring billing (a vendor charging the same amount
  // every month) is the most common AP pattern and would false-positive
  // constantly. Duplicate detection keys on the invoice NUMBER, which a re-send
  // reliably reuses and a genuinely new charge does not.
  return NONE;
}
