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
import { listAddedPos, listPoOverrides } from "./poOverridesStore";
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

// =====================================================================
// PO REGISTER VIEW: the source of truth, made visible and editable
// =====================================================================
// The register is what every invoice is checked against, but it was headless
// (no screen) and frozen (the seed never changed). These helpers surface it as
// a maintainable list: reads overlay any human edits from the overrides store,
// and the terms-policy flag activates the otherwise-dormant agreed_terms field
// by measuring each PO against Iovance's standard net-payment-terms threshold.

const RAW_REGISTER_ROWS: RegisterRow[] = (registerData as RegisterFile).purchaseOrders;

// A full register row for the view: every stored field, plus whether a human has
// edited it and whether its negotiated terms sit below the Iovance standard.
export interface RegisterViewRow {
  key: string;                 // stable identity: the seed PO number, or a created PO's id
  isAdded: boolean;            // true for a reviewer-created PO (vs a seed row)
  poNumber: string;            // the effective (override-applied) PO number
  vendor: string;
  workOrder: string;
  sowRef: string;
  contractValue: number;
  spentToDate: number;
  remaining: number;
  agreedTerms: number;
  status: string;
  edited: boolean;             // a human override is applied (or the row is created)
  updatedAt: string | null;    // when, if edited
  updatedBy: string | null;    // who, if edited
  termsBelowStandard: boolean; // agreedTerms shorter than the Net standard
}

// The register with overrides applied and the terms flag computed against
// `minNetDays` (the same editable clause threshold the contract playbook uses,
// so the standard is defined in exactly one place). Payment windows SHORTER than
// the standard are the vendor-favorable deviation that strains cash timing.
export async function getRegisterView(minNetDays: number): Promise<RegisterViewRow[]> {
  const [overrides, added] = await Promise.all([listPoOverrides(), listAddedPos()]);

  // Reviewer-created POs first, so a freshly sourced PO is at the top of the list.
  const addedRows: RegisterViewRow[] = added.map((a) => ({
    key: a.id,
    isAdded: true,
    poNumber: a.poNumber,
    vendor: a.vendor,
    workOrder: a.workOrder,
    sowRef: a.sowRef,
    contractValue: a.contractValue,
    spentToDate: a.spentToDate,
    remaining: a.remaining,
    agreedTerms: a.agreedTerms,
    status: a.status,
    edited: true,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    termsBelowStandard: typeof a.agreedTerms === "number" && a.agreedTerms < minNetDays,
  }));

  // Seed rows with any override fields overlaid. The override is keyed by the seed
  // PO number even when it renames the PO, so the row's identity (`key`) is stable.
  const seedRows: RegisterViewRow[] = RAW_REGISTER_ROWS.map((r) => {
    const o = overrides[r.po_number];
    const agreedTerms = o?.agreedTerms ?? r.agreed_terms;
    return {
      key: r.po_number,
      isAdded: false,
      poNumber: o?.poNumber ?? r.po_number,
      vendor: o?.vendor ?? r.vendor_name,
      workOrder: o?.workOrder ?? r.work_order,
      sowRef: o?.sowRef ?? r.sow_ref,
      contractValue: o?.contractValue ?? r.contract_value,
      spentToDate: o?.spentToDate ?? r.spent_to_date,
      remaining: o?.remaining ?? r.remaining,
      agreedTerms,
      status: o?.status ?? r.status,
      edited: !!o,
      updatedAt: o?.updatedAt ?? null,
      updatedBy: o?.updatedBy ?? null,
      termsBelowStandard: typeof agreedTerms === "number" && agreedTerms < minNetDays,
    };
  });

  return [...addedRows, ...seedRows];
}

// The matcher loader that honors human edits: the selected dataset with any
// override fields applied, PLUS the reviewer-created POs appended, so an edit to
// a PO (or a brand-new PO) actually changes what the next invoice is checked
// against. The created POs are matchable under every dataset.
export async function loadPurchaseOrdersWithOverrides(dataset: PoDataset = "demo"): Promise<PurchaseOrder[]> {
  const base = loadPurchaseOrders(dataset);
  const [overrides, added] = await Promise.all([listPoOverrides(), listAddedPos()]);
  const overridden: PurchaseOrder[] = base.map((po) => {
    const o = overrides[po.poNumber];
    if (!o) return po;
    return {
      poNumber: o.poNumber ?? po.poNumber,
      vendor: o.vendor ?? po.vendor,
      workOrder: o.workOrder ?? po.workOrder,
      contractValue: o.contractValue ?? po.contractValue,
      remaining: o.remaining ?? po.remaining,
    };
  });
  const addedPos: PurchaseOrder[] = added.map((a) => ({
    poNumber: a.poNumber,
    vendor: a.vendor,
    workOrder: a.workOrder,
    contractValue: a.contractValue,
    remaining: a.remaining,
  }));
  return [...overridden, ...addedPos];
}
