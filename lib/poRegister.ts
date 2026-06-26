// The PO lookup: the "Points Purchasing" register the invoice check resolves
// against. In production this is the AP system of record; here it is the
// synthetic register generated alongside the invoice corpus (mock data/registers),
// copied into data/po_register.json so the app and the corpus share one PO
// universe. That is what lets an uploaded corpus invoice (e.g. one citing
// PO-2026-027) actually find its PO, run the budget check, and trip the engineered
// over_budget cases, instead of matching against a 6-row demo stub.
//
// Two PO universes coexist on purpose:
//   - the curated golden-demo POs (lib/mockData.PURCHASE_ORDERS, PO-44xxx), and
//   - this register (PO-2026-xxx, 79 POs across 37 vendors).
// They are disjoint by PO number, so exact-PO matching never crosses them. The
// triage route picks the lookup by `dataset`, defaulting to the demo set so the
// scripted on-load demo is byte-for-byte unchanged; corpus checking and uploaded
// real invoices opt into the register.

import { PurchaseOrder } from "./types";
import { PURCHASE_ORDERS } from "./mockData";
import registerData from "@/data/po_register.json";

// Raw shape of a row in data/po_register.json (a superset of PurchaseOrder).
interface RegisterRow {
  po_number: string;
  vendor_name: string;
  work_order: string;
  sow_ref: string;
  contract_value: number;
  spent_to_date: number;
  remaining: number;
  agreed_terms: number;
  status: string;
}

interface RegisterFile {
  count: number;
  purchaseOrders: RegisterRow[];
}

// The register mapped into the matcher's PurchaseOrder shape. The richer fields
// (agreed_terms, sow_ref, spent_to_date, status) are carried on the side for
// callers that want them, but the matcher only needs these five.
export const REGISTER_POS: PurchaseOrder[] = (registerData as RegisterFile).purchaseOrders.map(
  (r) => ({
    poNumber: r.po_number,
    vendor: r.vendor_name,
    workOrder: r.work_order,
    contractValue: r.contract_value,
    remaining: r.remaining,
  }),
);

// Side metadata, keyed by PO number, for callers that need the agreed terms (the
// terms_mismatch check) or the SOW (the wrong_sow check) without widening the
// shared PurchaseOrder type.
export interface RegisterDetail {
  agreedTerms: number;
  sowRef: string;
  spentToDate: number;
  status: string;
}

const DETAIL_BY_PO: Map<string, RegisterDetail> = new Map(
  (registerData as RegisterFile).purchaseOrders.map((r) => [
    r.po_number,
    { agreedTerms: r.agreed_terms, sowRef: r.sow_ref, spentToDate: r.spent_to_date, status: r.status },
  ]),
);

export function getRegisterDetail(poNumber: string): RegisterDetail | null {
  return DETAIL_BY_PO.get(poNumber) ?? null;
}

export type PoDataset = "demo" | "corpus" | "all";

// Resolve which PO universe the invoice check should look up against.
//   demo   -> the curated golden-demo POs only (default; on-load demo unchanged)
//   corpus -> the register only (for checking the synthetic invoice corpus)
//   all    -> both, deduped by PO number (corpus invoices + demo invoices together)
export function loadPurchaseOrders(dataset: PoDataset = "demo"): PurchaseOrder[] {
  if (dataset === "corpus") return REGISTER_POS.slice();
  if (dataset === "all") {
    const byNumber = new Map<string, PurchaseOrder>();
    for (const po of [...PURCHASE_ORDERS, ...REGISTER_POS]) {
      if (!byNumber.has(po.poNumber)) byNumber.set(po.poNumber, po);
    }
    return [...byNumber.values()];
  }
  return PURCHASE_ORDERS.slice();
}

export function isPoDataset(v: unknown): v is PoDataset {
  return v === "demo" || v === "corpus" || v === "all";
}
