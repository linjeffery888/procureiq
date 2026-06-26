// Synthetic, representative biotech data for the whole platform. Built so the
// demo runs with ZERO real Iovance data (none obtained yet). Swap in real
// anonymized records once Ben shares them. Nothing here is real Iovance paper;
// every vendor, figure, invoice, and precedent is invented.
//
// One file feeds both modules: the sample contracts ContractIQ reviews, the POs
// / invoices / budget lines BudgetIQ matches and accrues against, and the seed
// precedents the Knowledge module indexes. They share vendor names on purpose so
// the lifecycle (contract -> PO -> invoice -> accrual) is traceable on screen.

import { PurchaseOrder, Invoice, VendorBudgetLine, CorpusDoc } from "./types";

// =====================================================================
// CONTRACTIQ sample contracts
// =====================================================================
export const SAMPLE_CONTRACT = `MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of March 3, 2026
by and between Iovance Biotherapeutics, Inc. ("Client") and CryoLogix Cold Chain
Solutions, LLC ("Vendor").

1. SERVICES. Vendor will provide cryogenic shipping and cold-chain monitoring
services for cell therapy logistics as described in each applicable work order.

2. TERM. This Agreement begins on the Effective Date and continues for a period
of twenty-four (24) months. This Agreement shall automatically renew for
successive one (1) year terms unless either party provides written notice not to
renew at least thirty (30) days prior to the end of the then-current term.

3. FEES AND PAYMENT. Client shall pay all undisputed invoices within fifteen (15)
days of receipt. Total contract value is not to exceed $480,000 over the initial term.

4. LIMITATION OF LIABILITY. Vendor's total liability under this Agreement shall not
exceed the total fees paid in the twelve (12) months preceding the claim. Neither
party shall be liable for indirect or consequential damages.

5. INTELLECTUAL PROPERTY. All work product, data, and deliverables created under
this Agreement shall be the sole property of Vendor, who grants Client a
non-exclusive license to use such deliverables.

6. CONFIDENTIALITY. Each party agrees to protect the other's confidential
information for a period of two (2) years following termination.

7. TERMINATION. Either party may terminate for material breach with thirty (30)
days written notice and opportunity to cure.

8. GOVERNING LAW. This Agreement shall be governed by the laws of the State of
Delaware.`;

export const SAMPLE_CONTRACT_2 = `SOFTWARE LICENSE AND SUBSCRIPTION AGREEMENT

Between Iovance Biotherapeutics, Inc. and Helix Analytics Inc., effective
April 12, 2026.

1. LICENSE. Helix grants Iovance a subscription to its data analytics platform.

2. TERM. Initial term of thirty-six (36) months.

3. PAYMENT. Net sixty (60) days. Annual subscription fee of $220,000.

4. LIABILITY. Helix's aggregate liability is unlimited with respect to any breach
of its obligations under this Agreement.

5. INTELLECTUAL PROPERTY. Iovance retains all rights to its data. Helix owns the
platform and any improvements thereto.

6. DATA PRIVACY. The platform may process personal data of Iovance personnel. No
Data Processing Agreement is attached.

7. TERMINATION. Iovance may terminate for convenience upon ninety (90) days notice.

8. GOVERNING LAW. Governed by the laws of England and Wales.`;

// A FULL CLEAN PASS: a routine SaaS subscription renewal that clears every one of
// the eight playbook clauses (Net 60, a 12-month-of-fees liability cap, vendor
// keeps only its pre-existing platform IP, 5-year confidentiality, a convenience
// exit, auto-renew with 90 days' opt-out notice, personal data under a DPA, and
// Delaware law). This is the boring, correct paper the first pass should clear
// without escalating, so the demo shows the system passing clean work, not only
// flagging deviations. Standalone (cites no parent); all parties are synthetic.
export const SAMPLE_SAAS_RENEWAL = `SOFTWARE LICENSE AND SUBSCRIPTION AGREEMENT

This Software License and Subscription Agreement ("Agreement") is entered into as
of February 1, 2026 by and between: Nimbus Observability, Inc. ("Vendor"); and
Iovance Biotherapeutics, Inc. ("Client"). This Agreement renews the parties' prior
subscription and restates the standard terms in full below.

1. SUBSCRIPTION. Vendor grants Client a subscription to its cloud observability and
log-analytics platform supporting Client's IT operations.

2. TERM. The subscription term is twenty-four (24) months from the Effective Date.
The Agreement automatically renews for successive twelve-month terms unless either
party provides ninety (90) days' prior written notice that it elects not to renew.

3. FEES AND PAYMENT. The annual subscription fee is $180,000. Client shall pay all
undisputed invoices Net sixty (60) days from receipt of invoice.

4. LIMITATION OF LIABILITY. Each party's aggregate liability under this Agreement
shall not exceed $2,000,000 (two million dollars), with customary carve-outs for
confidentiality and data breach. The parties set this cap in light of the personal
data the platform processes.

5. INTELLECTUAL PROPERTY. Vendor retains all right, title, and interest in and to
its pre-existing platform and any improvements thereto. Client owns all right,
title, and interest in its data and configurations. This is a subscription to
Vendor's platform and creates no bespoke deliverables or custom work product, so no
ownership question arises over assets built for Client.

6. CONFIDENTIALITY. Each party shall protect the other's confidential information
for a period of five (5) years following termination.

7. DATA PRIVACY. The platform processes personal data of Client personnel under a
Data Processing Agreement (DPA) included in this Agreement. The DPA requires Vendor
to encrypt the data to Client's standards, to maintain a current list of
subprocessors and notify Client before engaging any new subprocessor, and to notify
Client of any data breach without undue delay and within seventy-two (72) hours,
with defined remediation obligations.

8. TERMINATION. Client may terminate this Agreement for convenience upon ninety (90)
days prior written notice.

9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware,
without regard to its conflict of laws principles.`;

// A LINKED contract family: a parent MSA that fails three clauses and the change
// order that remediates every one of them. Reviewed alone, the change order
// looks clean (it carries its untouched terms from the parent), so the truth
// only appears once the two are evaluated as one unit. This pair is what proves
// the contract-family intelligence end to end: the resolver links the child to
// the parent by Contract No. (not vendor name), and the unit evaluation overlays
// the child's restated clauses onto the parent baseline so the parent's flags
// resolve. All parties, numbers, and the Apexion vendor are synthetic.

// Parent: fails on payment (Net 15), liability (uncapped), and IP (vendor owns
// the deliverables). Prints its own Contract No. so the change order can cite it.
export const SAMPLE_PARENT_MSA = `Contract No.: IOV-MSA-2024-0142

MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of March 14, 2024
by and between Iovance Biotherapeutics, Inc. ("Client") and Apexion Cloud
Services, Inc. ("Vendor").

1. SERVICES. Vendor will provide cloud hosting and managed platform services for
Iovance's cell therapy data systems, as described in one or more statements of
work issued under this Agreement.

2. TERM. This Agreement begins on the Effective Date and continues for a period of
twenty-four (24) months. This Agreement does not automatically renew; continuation
beyond the initial term requires a new written agreement signed by both parties.

3. FEES AND PAYMENT. Client shall pay all undisputed invoices within fifteen (15)
days of receipt. Total contract value is not to exceed $640,000 over the initial
term.

4. LIMITATION OF LIABILITY. There shall be no limitation on Vendor's aggregate
liability under this Agreement, and Vendor shall be liable for all damages arising
out of or relating to its performance.

5. INTELLECTUAL PROPERTY. All work product, data, and deliverables created under
this Agreement shall be the sole property of Vendor, who grants Client a
non-exclusive, non-transferable license to use such deliverables.

6. CONFIDENTIALITY. Each party agrees to protect the other's confidential
information for a period of five (5) years following termination.

7. TERMINATION. Either party may terminate this Agreement for convenience upon
sixty (60) days prior written notice, and for material breach upon thirty (30)
days written notice and opportunity to cure.

8. GOVERNING LAW. This Agreement shall be governed by the laws of the State of
Delaware, without regard to its conflict of laws principles.`;

// Child: cites the parent's Contract No. exactly, incorporates it by reference
// with an order-of-precedence clause, and restates Sections 4, 5, and 6 with
// passing values (Net 60, a 12-month-of-fees cap, Iovance owns the deliverables).
// Every clause it touches flips the parent's flag to a pass in the unit view.
export const SAMPLE_CHANGE_ORDER = `Change Order No.: IOV-CO-2024-0142-02

CHANGE ORDER

This Change Order ("Change Order") is entered into as of May 2, 2026 by and
between Iovance Biotherapeutics, Inc. ("Client") and Apexion Cloud Services, Inc.
("Vendor").

REFERENCE TO PARENT AGREEMENT. This Change Order is issued under and governed by
that certain Master Services Agreement No. IOV-MSA-2024-0142, dated March 14,
2024, between Apexion Cloud Services, Inc. ("Vendor") and Iovance Biotherapeutics,
Inc. ("Client") (the "Agreement"), which is incorporated herein by reference. In
the event of any conflict, the order of precedence is this Change Order, then the
Agreement.

1. AMENDED PAYMENT TERMS. Section 4 (Fees and Payment) of the Agreement is amended
so that Client shall pay all undisputed invoices within sixty (60) days of receipt
(Net 60).

2. AMENDED LIMITATION OF LIABILITY. Section 5 is amended so that each party's
aggregate liability shall not exceed the total fees paid in the twelve (12) months
preceding the claim, with carve-outs for infringement of intellectual property,
data breach, and indemnification obligations.

3. AMENDED INTELLECTUAL PROPERTY. Section 6 is amended so that the Client owns all
right, title, and interest in the deliverables and work product created under the
Agreement, and Vendor retains only its pre-existing platform intellectual
property.

4. EFFECT OF CHANGE ORDER. Except as expressly amended herein, all terms and
conditions of the Agreement remain in full force and effect.`;

// =====================================================================
// BUDGETIQ purchase orders, invoices, budget lines
// =====================================================================
export const PURCHASE_ORDERS: PurchaseOrder[] = [
  { poNumber: "PO-44120", vendor: "CryoLogix Cold Chain Solutions", workOrder: "WO-2231", contractValue: 480000, remaining: 412000 },
  { poNumber: "PO-44135", vendor: "Helix Analytics", workOrder: "WO-2240", contractValue: 660000, remaining: 605000 },
  // Small work-order PO, nearly exhausted late in term: the after-hours overage on INV-9003 trips the over_budget path.
  { poNumber: "PO-44160", vendor: "Sentinel Managed Services", workOrder: "WO-2255", contractValue: 60000, remaining: 11000 },
  { poNumber: "PO-44188", vendor: "BioReliance QC Labs", workOrder: "WO-2270", contractValue: 220000, remaining: 180000 },
  { poNumber: "PO-44195", vendor: "Veritas Cloud Infrastructure", workOrder: "WO-2281", contractValue: 288000, remaining: 240000 },
  { poNumber: "PO-44210", vendor: "Clarivue Document AI", workOrder: "WO-2290", contractValue: 48000, remaining: 35000 },
];

export const INVOICES: Invoice[] = [
  // --- Clean exact matches: PO cited, exact vendor, within budget (auto-clear) ---
  { invoiceNumber: "INV-9001", vendor: "CryoLogix Cold Chain Solutions", amount: 20000, poNumberClaimed: "PO-44120", lineItems: ["May cold-chain monitoring"], receivedDate: "2026-06-15" },
  { invoiceNumber: "INV-9005", vendor: "Helix Analytics", amount: 18333, poNumberClaimed: "PO-44135", lineItems: ["Q2 platform subscription"], receivedDate: "2026-06-15" },
  { invoiceNumber: "INV-9007", vendor: "BioReliance QC Labs", amount: 15000, poNumberClaimed: "PO-44188", lineItems: ["Release testing, lot batch May"], receivedDate: "2026-06-16" },
  { invoiceNumber: "INV-9008", vendor: "Veritas Cloud Infrastructure", amount: 20000, poNumberClaimed: "PO-44195", lineItems: ["June compute + storage"], receivedDate: "2026-06-16" },
  { invoiceNumber: "INV-9013", vendor: "CryoLogix Cold Chain Solutions", amount: 20000, poNumberClaimed: "PO-44120", lineItems: ["June cold-chain monitoring"], receivedDate: "2026-06-18" },
  { invoiceNumber: "INV-9014", vendor: "Helix Analytics", amount: 18333, poNumberClaimed: "PO-44135", lineItems: ["Q2 platform subscription, true-up"], receivedDate: "2026-06-18" },
  { invoiceNumber: "INV-9015", vendor: "CryoLogix Cold Chain Solutions", amount: 52000, poNumberClaimed: "PO-44120", lineItems: ["Annual equipment true-up"], receivedDate: "2026-06-19" },

  // --- No PO cited, but the vendor name (with a corporate suffix) resolves by
  //     deterministic normalization to exactly one open PO (auto-clear, audited) ---
  { invoiceNumber: "INV-9002", vendor: "Helix Analytics, Inc.", amount: 18333, poNumberClaimed: null, lineItems: ["Platform subscription"], receivedDate: "2026-06-16" },

  // --- Messy vendor names an exact/normalized rule cannot resolve. Live AI
  //     triage resolves these to the right PO; the deterministic offline engine
  //     cannot, so it routes them to a human (the visible AI lift) ---
  { invoiceNumber: "INV-9006", vendor: "BioReliance QC", amount: 15000, poNumberClaimed: null, lineItems: ["Stability testing, June"], receivedDate: "2026-06-17" },
  { invoiceNumber: "INV-9010", vendor: "Veritas Cloud Infra", amount: 20000, poNumberClaimed: null, lineItems: ["July compute reservation"], receivedDate: "2026-06-18" },

  // --- Sparse vendor string: AI resolves but at medium confidence, so it goes
  //     to a quick human confirm rather than auto-clearing (the review path) ---
  { invoiceNumber: "INV-9016", vendor: "Clarivue", amount: 12000, poNumberClaimed: null, lineItems: ["Document AI seats, Q2"], receivedDate: "2026-06-19" },

  // --- Genuine exceptions a human must own ---
  // Over remaining budget on a near-exhausted PO (after-hours overage).
  { invoiceNumber: "INV-9003", vendor: "Sentinel Managed Services", amount: 14000, poNumberClaimed: "PO-44160", lineItems: ["June managed services", "Overage: after-hours support"], receivedDate: "2026-06-17" },
  // Clearly over remaining: likely the wrong bucket or a missing PO amendment.
  { invoiceNumber: "INV-9009", vendor: "Helix Analytics", amount: 700000, poNumberClaimed: "PO-44135", lineItems: ["Enterprise license, multi-year prepay"], receivedDate: "2026-06-18" },
  // Wrong PO: the invoice cites a REAL PO that belongs to a DIFFERENT vendor.
  // Ben's exact failure mode (the PO says one vendor, the invoice is from
  // another). The cited PO exists, so this is not a no_po; the vendor-mismatch
  // guard in matching.ts routes it to a human to reassign and never auto-clears
  // a payment against the wrong PO. PO-44135 belongs to Helix, not Veritas.
  { invoiceNumber: "INV-9011", vendor: "Veritas Cloud Infrastructure", amount: 20000, poNumberClaimed: "PO-44135", lineItems: ["August compute reservation"], receivedDate: "2026-06-19" },
  // No open PO for this vendor at all: needs manual sourcing.
  { invoiceNumber: "INV-9004", vendor: "Quantum Logistics Partners", amount: 30000, poNumberClaimed: null, lineItems: ["Specimen courier, May"], receivedDate: "2026-06-16" },
];

// A realistic batch of uploaded invoices that cite the PO register (PO-2026-###),
// for the "Try a sample" shortcut. They load straight into the upload queue and
// are triaged against the full register ("all" dataset), so the DETERMINISTIC
// engine matches most of them by exact PO and catches the exceptions by rule; the
// AI is left only to draft triage prose, not to resolve everything. That keeps the
// "deterministic engine is the first step" story visible on real invoices.
//
// The set deliberately spans every deterministic outcome:
//   - exact PO + vendor + within budget -> matched by rule (most rows)
//   - INV-AL over the PO's remaining     -> over_budget by rule
//   - INV-CV / INV-GN cite a real PO that belongs to ANOTHER vendor -> wrong-PO
//     vendor mismatch, routed to a human by rule (Ben's exact failure mode)
//   - the BlueVector pair (the original, then its -R revision) demonstrates the
//     deterministic dedup / revision catch: the -R is flagged as superseding the
//     original, which sits just before it in the batch.
export const SAMPLE_UPLOAD_INVOICES: Invoice[] = [
  { invoiceNumber: "INV-AC-2026-0505", vendor: "Apexion Cloud Services", amount: 8300, poNumberClaimed: "PO-2026-003", lineItems: ["April cloud capacity"], receivedDate: "2026-05-05" },
  // Exact PO + vendor, but $123,678 exceeds the PO's remaining -> over_budget by rule.
  { invoiceNumber: "INV-AL-2026-0618", vendor: "Alloy Software Systems", amount: 123678, poNumberClaimed: "PO-2026-013", lineItems: ["Enterprise license, annual"], receivedDate: "2026-06-18" },
  // BlueVector pair: the original first, then its -R revision. The revision's dedup
  // check finds the original earlier in the batch and flags that it supersedes it,
  // so the prior version is not also paid.
  { invoiceNumber: "INV-BL-2026-1121", vendor: "BlueVector Genomics", amount: 84200, poNumberClaimed: "PO-2026-112", lineItems: ["Sequencing pipeline, Q4"], receivedDate: "2026-11-21" },
  { invoiceNumber: "INV-BL-2026-1121-R", vendor: "BlueVector Genomics", amount: 89400, poNumberClaimed: "PO-2026-112", lineItems: ["Sequencing pipeline, Q4 (revised)"], receivedDate: "2026-12-02" },
  { invoiceNumber: "INV-BR-2026-0710", vendor: "BioReliance QC Systems", amount: 26214, poNumberClaimed: "PO-2026-137", lineItems: ["Release + stability testing, June"], receivedDate: "2026-07-10" },
  // Cites a real PO that belongs to a DIFFERENT vendor (PO-2026-138 is TitanSecure IT):
  // the deterministic vendor-mismatch guard routes it to a human (wrong PO).
  { invoiceNumber: "INV-CV-2026-0325", vendor: "CryoVault Logistics", amount: 7075, poNumberClaimed: "PO-2026-138", lineItems: ["Specimen cold storage, March"], receivedDate: "2026-03-25" },
  // Same wrong-PO failure mode (PO-2026-032 is VitalLink EHR Systems).
  { invoiceNumber: "INV-GN-2026-0616", vendor: "GenomeNext Bioinformatics", amount: 118600, poNumberClaimed: "PO-2026-032", lineItems: ["Variant analysis platform, Q2"], receivedDate: "2026-06-16" },
  { invoiceNumber: "INV-FL-2027-0420", vendor: "FlowMetric Cytometry", amount: 15265, poNumberClaimed: "PO-2026-019", lineItems: ["Flow cytometry panel run"], receivedDate: "2027-04-20" },
  { invoiceNumber: "INV-HR-2026-0301", vendor: "Horizon Regulatory Advisors", amount: 79044, poNumberClaimed: "PO-2026-134", lineItems: ["Regulatory submission support, Q1"], receivedDate: "2026-03-01" },
  { invoiceNumber: "INV-LC-2026-0818_39", vendor: "CryoVault Logistics", amount: 10770, poNumberClaimed: "PO-2026-001", lineItems: ["Courier + cold storage, August"], receivedDate: "2026-08-18" },
  { invoiceNumber: "INV-MS-2026-0607", vendor: "Meridian CDMO Solutions", amount: 43500, poNumberClaimed: "PO-2026-104", lineItems: ["Fill-finish batch, June"], receivedDate: "2026-06-07" },
  { invoiceNumber: "INV-NE-2026-1111", vendor: "NeuroSphere AI", amount: 162358, poNumberClaimed: "PO-2026-025", lineItems: ["ML platform license, annual"], receivedDate: "2026-11-11" },
];

export const BUDGET_LINES: VendorBudgetLine[] = [
  {
    vendor: "CryoLogix Cold Chain Solutions",
    annualBudget: 240000,
    monthlyExpected: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000],
    actualsToDate: [20000, 20000, 20000, 20000, 20000, 0, 0, 0, 0, 0, 0, 0],
    paymentSchedule: "Monthly, $20,000",
  },
  {
    vendor: "Helix Analytics",
    annualBudget: 220000,
    monthlyExpected: [18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333],
    actualsToDate: [0, 0, 0, 18333, 18333, 0, 0, 0, 0, 0, 0, 0],
    paymentSchedule: "Quarterly, $55,000",
  },
  {
    vendor: "Sentinel Managed Services",
    annualBudget: 144000,
    monthlyExpected: [12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000],
    actualsToDate: [12000, 12000, 14000, 12000, 13000, 0, 0, 0, 0, 0, 0, 0],
    paymentSchedule: "Monthly, variable (usage-based)",
  },
  // A per-batch QC vendor: predictable cadence but no fixed monthly amount, and the
  // release-testing invoice usually lands AFTER quarter close. So its close-month
  // accrual is a true ESTIMATE, trued up when the invoice posts. This is the
  // late-actual case finance described, and the line that exercises the explicit
  // "estimate, true-up" state in the accrual draft (vs scheduled / outreach / actual).
  {
    vendor: "BioReliance QC Labs",
    annualBudget: 180000,
    monthlyExpected: [15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000],
    actualsToDate: [15000, 0, 18000, 12000, 15000, 0, 0, 0, 0, 0, 0, 0],
    paymentSchedule: "Per batch, ~$15,000/mo (invoiced after testing)",
  },
];

// =====================================================================
// BUDGETIQ uploaded-document samples (synthetic invoice / budget PDFs)
// =====================================================================
// Ben described the manual reality: AP keys each PDF invoice into Points
// Purchasing, and finance re-keys vendor actuals into the budget spreadsheet.
// These two synthetic documents stand in for an uploaded PDF so the ingest path
// is demonstrable without a real file. The invoice cites an existing PO so it
// clears cleanly through the same matching; the actuals export carries the three
// budget-line vendors, including the usage-based one that normally needs outreach.

export const SAMPLE_INVOICE_PDF_TEXT = `INVOICE

Clarivue Document AI, Inc.
123 Market Street, Suite 400
San Francisco, CA 94103

Bill To: Iovance Biotherapeutics, Inc.
Invoice #: CLV-2026-0188
Invoice Date: 2026-06-24
PO Number: PO-44210

Description: Clarivue Document AI platform, Q2 seat true-up (12 seats)

Subtotal: $9,500.00
Amount Due: $9,500.00

Remit payment Net 30 to Clarivue Document AI, Inc.`;

export const SAMPLE_BUDGET_PDF_TEXT = `IOVANCE IT, Q2 VENDOR ACTUALS (Finance export)
Period: June 2026

Vendor                              June actual
Apexion Cloud Services              $131,000
Veritas Data Corp                   $94,200
Meridian CDMO Solutions             $762,000

Total                               $987,200`;

// =====================================================================
// KNOWLEDGE seed precedents (the RAG corpus, all synthetic)
// =====================================================================
// Segmented the way the production corpus would be: pass cases (renewals and
// accepted big-corp terms the attorney waved through) and flag cases (the named
// deviations Ben called out). At review time the closest precedents are
// retrieved as evidence; the deterministic playbook still owns the flag call.
// The labels double as an eval ground truth ("matched the attorney's call X%").
export const SEED_PRECEDENTS: CorpusDoc[] = [
  {
    id: "seed-net_payment_terms-flag-01",
    title: "TitanSecure IT Solutions, Inc. MSA: net payment terms (flag)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "All fees are due upon receipt of invoice. Vendor may charge interest of two percent (2%) per month on any amount not paid within five (5) days of the invoice date.",
    note: "Fees due on receipt, far below the Net 40/45/60 standard. Attorney flagged.",
    addedAt: "2025-09-17T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-02",
    title: "CRISPR Therapeutics AG renewal: net payment terms (flag)",
    vendor: "CRISPR Therapeutics AG",
    docType: "renewal",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within Net 15 days of invoice date. Payment Terms: Net 30 days from date of invoice.",
    note: "Net 15/30 is below the Net 40/45/60 standard. Attorney flagged the short terms and pushed toward Net 60.",
    addedAt: "2025-09-19T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-03",
    title: "Merck KGaA (MilliporeSigma) SOW: net payment terms (flag)",
    vendor: "Merck KGaA (MilliporeSigma)",
    docType: "SOW",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "The total fees for all services and deliverables described herein shall be as set forth below: Payment Terms: Due on receipt. All fees are payable in U.S.",
    note: "Fees due on receipt, far below the Net 40/45/60 standard. Attorney flagged.",
    addedAt: "2025-09-21T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-04",
    title: "Clinuvel Pharmaceuticals Limited renewal: net payment terms (flag)",
    vendor: "Clinuvel Pharmaceuticals Limited",
    docType: "renewal",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within Net 15 days of invoice date. Payment Terms: Net 30 days from date of invoice.",
    note: "Net 15/30 is below the Net 40/45/60 standard. Attorney flagged the short terms and pushed toward Net 60.",
    addedAt: "2025-09-23T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-05",
    title: "Medigus Ltd. SOW: net payment terms (flag)",
    vendor: "Medigus Ltd.",
    docType: "SOW",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "The total fees for all services and deliverables described herein shall be as set forth below: Payment Terms: Due on receipt. All fees are payable in U.S.",
    note: "Fees due on receipt, far below the Net 40/45/60 standard. Attorney flagged.",
    addedAt: "2025-09-25T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-06",
    title: "Caladrius Biosciences, Inc. renewal: net payment terms (flag)",
    vendor: "Caladrius Biosciences, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within Net 15 days of invoice date. Payment Terms: Net 30 days from date of invoice.",
    note: "Net 15/30 is below the Net 40/45/60 standard. Attorney flagged the short terms and pushed toward Net 60.",
    addedAt: "2025-09-27T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-07",
    title: "Vertex Pharmaceuticals, Inc. SOW: net payment terms (flag)",
    vendor: "Vertex Pharmaceuticals, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "The total fees for all services and deliverables described herein shall be as set forth below: Payment Terms: Due on receipt. All fees are payable in U.S.",
    note: "Fees due on receipt, far below the Net 40/45/60 standard. Attorney flagged.",
    addedAt: "2025-09-29T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-flag-08",
    title: "TitanSecure IT Solutions, Inc. SOW: net payment terms (flag)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "net_payment_terms",
    text: "All fees are due upon receipt of invoice and in any event within fifteen (15) days of invoice date.",
    note: "Net 15/30 is below the Net 40/45/60 standard. Attorney flagged the short terms and pushed toward Net 60.",
    addedAt: "2025-10-01T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-09",
    title: "Sentinel Compliance Partners, Inc. MSA: net payment terms (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-03T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-10",
    title: "QuantumLeap Therapeutics, Inc. MSA: net payment terms (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within forty-five (45) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-05T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-11",
    title: "Oracle America, Inc. MSA: net payment terms (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-07T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-12",
    title: "Stratos Cloud Infrastructure, Inc. MSA: net payment terms (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-09T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-13",
    title: "Syneos Health, Inc. MSA: net payment terms (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-11T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-14",
    title: "TitanSecure IT Solutions, Inc. MSA: net payment terms (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-13T00:00:00.000Z",
  },
  {
    id: "seed-net_payment_terms-pass-15",
    title: "BCRJ Clinical Research Unit MSA: net payment terms (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "net_payment_terms",
    text: "All fees are payable in U.S. dollars within sixty (60) days of invoice date unless otherwise specified.",
    note: "Net 60 (or Net 45) terms, within Iovance's Net 40/45/60 standard. Attorney passed.",
    addedAt: "2025-10-15T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-01",
    title: "Bayer AG MSA: limitation of liability (flag)",
    vendor: "Bayer AG",
    docType: "MSA",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $250,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability cap set too low for a PHI/PII vendor. Attorney flagged and required a higher cap.",
    addedAt: "2025-10-17T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-02",
    title: "Avantor, Inc. MSA: limitation of liability (flag)",
    vendor: "Avantor, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "8.1 Liability. EACH PARTY SHALL BE LIABLE FOR ALL DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, INCLUDING DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, AND PUNITIVE DAMAGES, WITHOUT LIMITATION. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF LIABILITY SET FORTH IN THIS SECTION SHALL APPLY REGARDLESS OF THE FORM OF ACTION, WHETHER IN ...",
    note: "Liability stated as unlimited or the cap removed on a data vendor. Attorney flagged and required a cap.",
    addedAt: "2025-10-19T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-03",
    title: "Pacific Life Sciences, Inc. MSA: limitation of liability (flag)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $250,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability cap set too low for a PHI/PII vendor. Attorney flagged and required a higher cap.",
    addedAt: "2025-10-21T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-04",
    title: "Helix Analytics Corporation renewal: limitation of liability (flag)",
    vendor: "Helix Analytics Corporation",
    docType: "renewal",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, OR EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. THERE SHALL BE NO LIMITATION ON EITHER PARTY'S LIABILITY UNDER THIS AGREEMENT, AND NO MONETARY CAP SHALL APPLY TO ANY DAMAGES, INCLUDING DIRECT, INDIRECT, AND CONSEQUENTIAL DAMAGES.",
    note: "Liability stated as unlimited or the cap removed on a data vendor. Attorney flagged and required a cap.",
    addedAt: "2025-10-23T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-05",
    title: "Valneva SE MSA: limitation of liability (flag)",
    vendor: "Valneva SE",
    docType: "MSA",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $250,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability cap set too low for a PHI/PII vendor. Attorney flagged and required a higher cap.",
    addedAt: "2025-10-25T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-06",
    title: "Veritas Data Corporation renewal: limitation of liability (flag)",
    vendor: "Veritas Data Corporation",
    docType: "renewal",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, OR EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. THERE SHALL BE NO LIMITATION ON EITHER PARTY'S LIABILITY UNDER THIS AGREEMENT, AND NO MONETARY CAP SHALL APPLY TO ANY DAMAGES, INCLUDING DIRECT, INDIRECT, AND CONSEQUENTIAL DAMAGES.",
    note: "Liability stated as unlimited or the cap removed on a data vendor. Attorney flagged and required a cap.",
    addedAt: "2025-10-27T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-07",
    title: "Portola Pharmaceuticals, Inc. renewal: limitation of liability (flag)",
    vendor: "Portola Pharmaceuticals, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, OR EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. EACH PARTY'S TOTAL CUMULATIVE LIABILITY SHALL NOT EXCEED $250,000.",
    note: "Liability cap set too low for a PHI/PII vendor. Attorney flagged and required a higher cap.",
    addedAt: "2025-10-29T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-flag-08",
    title: "Zealand Pharma A/S renewal: limitation of liability (flag)",
    vendor: "Zealand Pharma A/S",
    docType: "renewal",
    label: "flag",
    clauseTag: "limitation_of_liability",
    text: "EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, OR EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. EACH PARTY'S TOTAL CUMULATIVE LIABILITY SHALL NOT BE LIMITED AND MAY EXCEED THE TOTAL FEES PAID BY CLIENT TO VENDOR IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.",
    note: "Liability stated as unlimited or the cap removed on a data vendor. Attorney flagged and required a cap.",
    addedAt: "2025-10-31T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-09",
    title: "Sentinel Compliance Partners, Inc. MSA: limitation of liability (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $500,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-02T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-10",
    title: "QuantumLeap Therapeutics, Inc. MSA: limitation of liability (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $1,000,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-04T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-11",
    title: "Oracle America, Inc. MSA: limitation of liability (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $500,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-06T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-12",
    title: "Stratos Cloud Infrastructure, Inc. MSA: limitation of liability (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $1,000,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-08T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-13",
    title: "Syneos Health, Inc. MSA: limitation of liability (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $500,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-10T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-14",
    title: "TitanSecure IT Solutions, Inc. MSA: limitation of liability (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $2,000,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-12T00:00:00.000Z",
  },
  {
    id: "seed-limitation_of_liability-pass-15",
    title: "BCRJ Clinical Research Unit MSA: limitation of liability (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "limitation_of_liability",
    text: "8.1 Cap on Liability. EXCEPT FOR BREACHES OF CONFIDENTIALITY, INDEMNIFICATION OBLIGATIONS, EITHER PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS, IN NO EVENT SHALL EITHER PARTY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED $500,000. 8.2 Exclusion of Consequential Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. 8.3 Essential Purpose. THE LIMITATIONS OF ...",
    note: "Liability capped (trailing-12-month fees or a stated dollar cap). Within standard. Passed.",
    addedAt: "2025-11-14T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-flag-01",
    title: "Sentinel Compliance Partners, Inc. NDA: confidentiality (flag)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "NDA",
    label: "flag",
    clauseTag: "confidentiality",
    text: "OBLIGATIONS OF RECEIVING PARTY The Receiving Party agrees to: (a) hold all Confidential Information in strict confidence and not disclose any Confidential Information to any third parties except as expressly permitted herein; (c) protect the Confidential Information with the same degree of care used to protect its own confidential information of like importance, but in no event less than reasonable care; (d) restrict disclosure of Confidential Information to those employees, contractors, advisors, and agents who have a need to know for the Purpose and who are bound by confidentiality obligations no less protective than those set forth herein; The obligations of ...",
    note: "Confidentiality obligations lack a survival period. Attorney flagged and added survival.",
    addedAt: "2025-11-16T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-02",
    title: "Sentinel Compliance Partners, Inc. MSA: confidentiality (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-18T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-03",
    title: "QuantumLeap Therapeutics, Inc. MSA: confidentiality (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-20T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-04",
    title: "Oracle America, Inc. MSA: confidentiality (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-22T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-05",
    title: "Stratos Cloud Infrastructure, Inc. MSA: confidentiality (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-24T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-06",
    title: "Syneos Health, Inc. MSA: confidentiality (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-26T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-07",
    title: "TitanSecure IT Solutions, Inc. MSA: confidentiality (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-28T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-08",
    title: "BCRJ Clinical Research Unit MSA: confidentiality (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-11-30T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-09",
    title: "Pacific Life Sciences, Inc. MSA: confidentiality (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-02T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-10",
    title: "Insmed Incorporated MSA: confidentiality (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-04T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-11",
    title: "Karyopharm Therapeutics Inc. MSA: confidentiality (pass)",
    vendor: "Karyopharm Therapeutics Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-06T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-12",
    title: "Transgene S.A. MSA: confidentiality (pass)",
    vendor: "Transgene S.A.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-08T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-13",
    title: "AC Immune SA MSA: confidentiality (pass)",
    vendor: "AC Immune SA",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-10T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-14",
    title: "PolyPid Ltd. MSA: confidentiality (pass)",
    vendor: "PolyPid Ltd.",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-12T00:00:00.000Z",
  },
  {
    id: "seed-confidentiality-pass-15",
    title: "Novartis AG MSA: confidentiality (pass)",
    vendor: "Novartis AG",
    docType: "MSA",
    label: "pass",
    clauseTag: "confidentiality",
    text: "6.1 Definition. \"Confidential Information\" means all non-public information disclosed by either Party that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 6.2 Obligations. Each Party agrees to: (a) use the same degree of care to protect Confidential Information as it uses to protect its own confidential information of like nature, but in no event less than reasonable care; (b) not use Confidential Information except as necessary to perform its obligations or exercise its rights under this Agreement; and (c) not disclose Confidential Information to any third ...",
    note: "Mutual confidentiality, standard carve-outs and a multi-year survival period. Passed.",
    addedAt: "2025-12-14T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-flag-01",
    title: "Nucleus Consulting Partners, LLC SOW: IP ownership (flag)",
    vendor: "Nucleus Consulting Partners, LLC",
    docType: "SOW",
    label: "flag",
    clauseTag: "ip_ownership",
    text: "All Deliverables created by Vendor under this SOW, including all custom configurations, reports, workflows, scripts, documentation, and training materials, shall be owned exclusively by Vendor as Vendor's intellectual property. Client is granted a limited, non-exclusive, non-transferable, revocable license to use the Deliverables solely for its internal business operations during the term. Client shall not modify, enhance, or create derivative works of any Deliverable without Vendor's prior written consent.",
    note: "Vendor retains ownership of bespoke deliverables. Attorney flagged and reversed the assignment to Iovance.",
    addedAt: "2025-12-16T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-flag-02",
    title: "Hexaware Technologies, Inc. SOW: IP ownership (flag)",
    vendor: "Hexaware Technologies, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "ip_ownership",
    text: "Hexaware shall own all right, title, and interest in and to all Deliverables, including all custom code, configurations, documentation, and reports created under this SOW. Hexaware grants Iovance a limited, non-exclusive, revocable license to use the Deliverables for internal purposes only. Iovance shall acquire no ownership of any Deliverable and shall not create derivative works without Hexaware's prior written consent.",
    note: "Vendor retains ownership of bespoke deliverables. Attorney flagged and reversed the assignment to Iovance.",
    addedAt: "2025-12-18T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-flag-03",
    title: "Roche Holding AG SOW: IP ownership (flag)",
    vendor: "Roche Holding AG",
    docType: "SOW",
    label: "flag",
    clauseTag: "ip_ownership",
    text: "All Deliverables created by Vendor under this SOW, including all custom configurations, reports, workflows, scripts, documentation, and training materials, shall be owned exclusively by Vendor as Vendor's intellectual property. Client is granted a limited, non-exclusive, non-transferable, revocable license to use the Deliverables solely for its internal business operations during the term. Client shall not modify, enhance, or create derivative works of any Deliverable without Vendor's prior written consent.",
    note: "Vendor retains ownership of bespoke deliverables. Attorney flagged and reversed the assignment to Iovance.",
    addedAt: "2025-12-20T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-flag-04",
    title: "Mirati Therapeutics, Inc. SOW: IP ownership (flag)",
    vendor: "Mirati Therapeutics, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "ip_ownership",
    text: "All Deliverables created by Vendor under this SOW, including all custom configurations, reports, workflows, scripts, documentation, and training materials, shall be owned exclusively by Vendor as Vendor's intellectual property. Client is granted a limited, non-exclusive, non-transferable, revocable license to use the Deliverables solely for its internal business operations during the term. Client shall not modify, enhance, or create derivative works of any Deliverable without Vendor's prior written consent.",
    note: "Vendor retains ownership of bespoke deliverables. Attorney flagged and reversed the assignment to Iovance.",
    addedAt: "2025-12-22T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-05",
    title: "Sentinel Compliance Partners, Inc. MSA: IP ownership (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2025-12-24T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-06",
    title: "QuantumLeap Therapeutics, Inc. MSA: IP ownership (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2025-12-26T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-07",
    title: "Oracle America, Inc. MSA: IP ownership (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2025-12-28T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-08",
    title: "Stratos Cloud Infrastructure, Inc. MSA: IP ownership (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2025-12-30T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-09",
    title: "Syneos Health, Inc. MSA: IP ownership (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-10",
    title: "TitanSecure IT Solutions, Inc. MSA: IP ownership (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-11",
    title: "BCRJ Clinical Research Unit MSA: IP ownership (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-12",
    title: "Pacific Life Sciences, Inc. MSA: IP ownership (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-07T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-13",
    title: "Insmed Incorporated MSA: IP ownership (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-09T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-14",
    title: "Karyopharm Therapeutics Inc. MSA: IP ownership (pass)",
    vendor: "Karyopharm Therapeutics Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-11T00:00:00.000Z",
  },
  {
    id: "seed-ip_ownership-pass-15",
    title: "Transgene S.A. MSA: IP ownership (pass)",
    vendor: "Transgene S.A.",
    docType: "MSA",
    label: "pass",
    clauseTag: "ip_ownership",
    text: "5.1 Vendor IP. Vendor retains all right, title, and interest in and to its pre-existing intellectual property, software, platforms, tools, methodologies, and proprietary materials, including all enhancements, modifications, and derivative works thereof (\"Vendor IP\"). No license or right to Vendor IP is granted except as expressly set forth herein. 5.2 Client IP. Client retains all right, title, and interest in and to its pre-existing intellectual property, data, and Confidential Information (\"Client IP\"). Vendor shall not use Client IP except as necessary to perform the Services. 5.3 Deliverables. Subject to full payment of all applicable fees, all Deliverables created ...",
    note: "Deliverables assigned to Iovance as work made for hire; vendor keeps only pre-existing IP. Passed.",
    addedAt: "2026-01-13T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-01",
    title: "QuantumLeap Therapeutics, Inc. MSA: data privacy / DPA (flag)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data, including patient health information, on behalf of Client in connection with the Services. No data processing agreement is attached to or incorporated into this Agreement, and the parties have not agreed to any specific data protection, subprocessor disclosure, or breach notification terms. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, ...",
    note: "Vendor processes personal data with no DPA attached. Attorney flagged and required one.",
    addedAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-02",
    title: "Stratos Cloud Infrastructure, Inc. MSA: data privacy / DPA (flag)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA omits subprocessor disclosure and flow-down. Attorney flagged.",
    addedAt: "2026-01-17T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-03",
    title: "Vertex Pharmaceuticals, Inc. MSA: data privacy / DPA (flag)",
    vendor: "Vertex Pharmaceuticals, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA omits a breach-notification obligation. Attorney flagged.",
    addedAt: "2026-01-19T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-04",
    title: "Waters Corporation MSA: data privacy / DPA (flag)",
    vendor: "Waters Corporation",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. Vendor may engage subprocessors to assist in providing the ...",
    note: "DPA omits encryption of data in transit and at rest. Attorney flagged.",
    addedAt: "2026-01-21T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-05",
    title: "10x Genomics, Inc. renewal: data privacy / DPA (flag)",
    vendor: "10x Genomics, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "data_privacy",
    text: "The Data Processing Agreement ('DPA') attached to the Original Agreement remains in full force and effect and applies to all personal data processed during the Renewal Term. Vendor shall maintain appropriate technical and organizational measures to protect personal data.",
    note: "DPA omits Iovance's audit rights over the processor. Attorney flagged.",
    addedAt: "2026-01-23T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-06",
    title: "Etica Clinical Research S.A. MSA: data privacy / DPA (flag)",
    vendor: "Etica Clinical Research S.A.",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. Vendor acknowledges that it may process personal data on behalf of Client in connection with the Services. Vendor shall implement reasonable security measures to protect such data.",
    note: "Vendor processes personal data with no DPA attached. Attorney flagged and required one.",
    addedAt: "2026-01-25T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-07",
    title: "Propanc Biopharma Inc. MSA: data privacy / DPA (flag)",
    vendor: "Propanc Biopharma Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA omits subprocessor disclosure and flow-down. Attorney flagged.",
    addedAt: "2026-01-27T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-flag-08",
    title: "Genmab A/S MSA: data privacy / DPA (flag)",
    vendor: "Genmab A/S",
    docType: "MSA",
    label: "flag",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA omits a breach-notification obligation. Attorney flagged.",
    addedAt: "2026-01-29T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-09",
    title: "Sentinel Compliance Partners, Inc. MSA: data privacy / DPA (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-01-31T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-10",
    title: "QuantumLeap Therapeutics, Inc. MSA: data privacy / DPA (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-02T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-11",
    title: "Oracle America, Inc. MSA: data privacy / DPA (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-04T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-12",
    title: "Stratos Cloud Infrastructure, Inc. MSA: data privacy / DPA (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-06T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-13",
    title: "Syneos Health, Inc. MSA: data privacy / DPA (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-08T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-14",
    title: "TitanSecure IT Solutions, Inc. MSA: data privacy / DPA (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-10T00:00:00.000Z",
  },
  {
    id: "seed-data_privacy-pass-15",
    title: "BCRJ Clinical Research Unit MSA: data privacy / DPA (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "data_privacy",
    text: "7.1 Data Protection. The parties acknowledge that Vendor may process personal data on behalf of Client in connection with the Services. The Data Processing Agreement attached hereto as Exhibit A and incorporated by reference herein shall govern such data processing activities. 7.2 Security Measures. Vendor shall implement and maintain appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. Such measures shall include, at a minimum, encryption of data in transit and at rest, access controls, regular security assessments, and incident response procedures. 7.3 Subprocessors. ...",
    note: "DPA in place with security measures, subprocessor controls and breach notification. Passed.",
    addedAt: "2026-02-12T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-01",
    title: "BioReliance Quality Solutions, Inc. renewal: key dates (flag)",
    vendor: "BioReliance Quality Solutions, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "key_dates",
    text: "This Software License Renewal Agreement (\"Renewal Agreement\") is entered into as of April 1, 2026 (\"Renewal Effective Date\") by and between: BioReliance Quality Solutions, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); RENEWAL OF AGREEMENT Subject to the terms and conditions of this Renewal Agreement, the Original Agreement is hereby renewed for a period of one (1) month (rolling monthly) commencing on the Renewal Effective Date (the \"Renewal Term\"). TERM The Renewal Term shall commence on April 1, 2026 and continue for one (1) month (rolling monthly) unless earlier terminated in accordance with Section 5 below.",
    note: "Execution date is roughly a year before the term it covers. Attorney flagged.",
    addedAt: "2026-02-14T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-02",
    title: "Carisma Therapeutics, Inc. SOW: key dates (flag)",
    vendor: "Carisma Therapeutics, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "key_dates",
    text: "This STATEMENT OF WORK (\"SOW\") is entered into as of April 02, 2026 by and between: Carisma Therapeutics, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\");",
    note: "Obligations backdated well before signing. Attorney flagged the retroactive effective date.",
    addedAt: "2026-02-16T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-03",
    title: "Apexion Cloud Services, Inc. change order: key dates (flag)",
    vendor: "Apexion Cloud Services, Inc.",
    docType: "change order",
    label: "flag",
    clauseTag: "key_dates",
    text: "This CHANGE ORDER (\"Change Order\") is entered into as of February 20, 2026 by and between: Apexion Cloud Services, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\");",
    note: "Effective date predates the parent agreement it amends. Attorney flagged.",
    addedAt: "2026-02-18T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-04",
    title: "Dynavax Technologies Corporation renewal: key dates (flag)",
    vendor: "Dynavax Technologies Corporation",
    docType: "renewal",
    label: "flag",
    clauseTag: "key_dates",
    text: "This Software License Renewal Agreement (\"Renewal Agreement\") is entered into as of January 01, 2024 (\"Renewal Effective Date\") by and between: Dynavax Technologies Corporation, a corporation with its principal place of business at the address set forth above (\"Vendor\"); RENEWAL OF AGREEMENT Subject to the terms and conditions of this Renewal Agreement, the Original Agreement is hereby renewed for a period of twelve (12) months commencing on the Renewal Effective Date (the \"Renewal Term\"). TERM The Renewal Term shall commence on January 01, 2024 and continue for twelve (12) months unless earlier terminated in accordance with Section 5 below.",
    note: "Execution date is roughly a year before the term it covers. Attorney flagged.",
    addedAt: "2026-02-20T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-05",
    title: "MyoKardia, Inc. SOW: key dates (flag)",
    vendor: "MyoKardia, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "key_dates",
    text: "This STATEMENT OF WORK (\"SOW\") is entered into as of June 14, 2026 by and between: MyoKardia, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\");",
    note: "Obligations backdated well before signing. Attorney flagged the retroactive effective date.",
    addedAt: "2026-02-22T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-06",
    title: "Servier SAS renewal: key dates (flag)",
    vendor: "Servier SAS",
    docType: "renewal",
    label: "flag",
    clauseTag: "key_dates",
    text: "This Software License Renewal Agreement (\"Renewal Agreement\") is entered into as of January 01, 2024 (\"Renewal Effective Date\") by and between: Servier SAS, a corporation with its principal place of business at the address set forth above (\"Vendor\"); RENEWAL OF AGREEMENT Subject to the terms and conditions of this Renewal Agreement, the Original Agreement is hereby renewed for a period of twelve (12) months commencing on the Renewal Effective Date (the \"Renewal Term\"). TERM The Renewal Term shall commence on January 01, 2024 and continue for twelve (12) months unless earlier terminated in accordance with Section 5 below.",
    note: "Execution date is roughly a year before the term it covers. Attorney flagged.",
    addedAt: "2026-02-24T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-07",
    title: "Shoreline Biosciences, Inc. SOW: key dates (flag)",
    vendor: "Shoreline Biosciences, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "key_dates",
    text: "This STATEMENT OF WORK (\"SOW\") is entered into as of March 14, 2026 by and between: Shoreline Biosciences, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\");",
    note: "Obligations backdated well before signing. Attorney flagged the retroactive effective date.",
    addedAt: "2026-02-26T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-flag-08",
    title: "uniQure N.V. renewal: key dates (flag)",
    vendor: "uniQure N.V.",
    docType: "renewal",
    label: "flag",
    clauseTag: "key_dates",
    text: "This Software License Renewal Agreement (\"Renewal Agreement\") is entered into as of January 01, 2024 (\"Renewal Effective Date\") by and between: uniQure N.V., a corporation with its principal place of business at the address set forth above (\"Vendor\"); RENEWAL OF AGREEMENT Subject to the terms and conditions of this Renewal Agreement, the Original Agreement is hereby renewed for a period of twelve (12) months commencing on the Renewal Effective Date (the \"Renewal Term\"). TERM The Renewal Term shall commence on January 01, 2024 and continue for twelve (12) months unless earlier terminated in accordance with Section 5 below.",
    note: "Execution date is roughly a year before the term it covers. Attorney flagged.",
    addedAt: "2026-02-28T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-09",
    title: "Sentinel Compliance Partners, Inc. MSA: key dates (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of January 15, 2026 (\"Effective Date\") by and between: Sentinel Compliance Partners, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of two (2) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-02T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-10",
    title: "QuantumLeap Therapeutics, Inc. MSA: key dates (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of February 1, 2026 (\"Effective Date\") by and between: QuantumLeap Therapeutics, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of three (3) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-04T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-11",
    title: "Oracle America, Inc. MSA: key dates (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of July 12, 2026 (\"Effective Date\") by and between: Oracle America, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of two (2) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-06T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-12",
    title: "Stratos Cloud Infrastructure, Inc. MSA: key dates (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of March 1, 2026 (\"Effective Date\") by and between: Stratos Cloud Infrastructure, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of two (2) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-08T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-13",
    title: "Syneos Health, Inc. MSA: key dates (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of September 11, 2026 (\"Effective Date\") by and between: Syneos Health, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of two (2) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-10T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-14",
    title: "TitanSecure IT Solutions, Inc. MSA: key dates (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of January 1, 2026 (\"Effective Date\") by and between: TitanSecure IT Solutions, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of three (3) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-12T00:00:00.000Z",
  },
  {
    id: "seed-key_dates-pass-15",
    title: "BCRJ Clinical Research Unit MSA: key dates (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "key_dates",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of September 17, 2026 (\"Effective Date\") by and between: BCRJ Clinical Research Unit, a corporation with its principal place of business at the address set forth above (\"Vendor\"); TERM AND RENEWAL This Agreement shall commence on the Effective Date and continue for an initial term of two (2) years (the \"Initial Term\").",
    note: "Effective date and term dates are internally consistent and current. Passed.",
    addedAt: "2026-03-14T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-01",
    title: "ICON plc renewal: governing law (flag)",
    vendor: "ICON plc",
    docType: "renewal",
    label: "flag",
    clauseTag: "governing_law",
    text: "This Renewal Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in California.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-02",
    title: "Jubilant Biosys Limited renewal: governing law (flag)",
    vendor: "Jubilant Biosys Limited",
    docType: "renewal",
    label: "flag",
    clauseTag: "governing_law",
    text: "This Renewal Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in California.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-18T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-03",
    title: "Twist Bioscience Corporation SOW: governing law (flag)",
    vendor: "Twist Bioscience Corporation",
    docType: "SOW",
    label: "flag",
    clauseTag: "governing_law",
    text: "This SOW shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflicts of law principles.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-20T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-04",
    title: "Orygen Biotecnologia S.A. SOW: governing law (flag)",
    vendor: "Orygen Biotecnologia S.A.",
    docType: "SOW",
    label: "flag",
    clauseTag: "governing_law",
    text: "This SOW shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflicts of law principles.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-22T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-05",
    title: "Horizon Therapeutics plc SOW: governing law (flag)",
    vendor: "Horizon Therapeutics plc",
    docType: "SOW",
    label: "flag",
    clauseTag: "governing_law",
    text: "This SOW shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflicts of law principles.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-24T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-flag-06",
    title: "Servier SAS SOW: governing law (flag)",
    vendor: "Servier SAS",
    docType: "SOW",
    label: "flag",
    clauseTag: "governing_law",
    text: "This SOW shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflicts of law principles.",
    note: "Governing law set to an off-standard jurisdiction. Attorney flagged for alignment to Delaware.",
    addedAt: "2026-03-26T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-07",
    title: "Sentinel Compliance Partners, Inc. MSA: governing law (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-03-28T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-08",
    title: "QuantumLeap Therapeutics, Inc. MSA: governing law (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-03-30T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-09",
    title: "Oracle America, Inc. MSA: governing law (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-10",
    title: "Stratos Cloud Infrastructure, Inc. MSA: governing law (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-03T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-11",
    title: "Syneos Health, Inc. MSA: governing law (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-05T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-12",
    title: "TitanSecure IT Solutions, Inc. MSA: governing law (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-07T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-13",
    title: "BCRJ Clinical Research Unit MSA: governing law (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-09T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-14",
    title: "Pacific Life Sciences, Inc. MSA: governing law (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-11T00:00:00.000Z",
  },
  {
    id: "seed-governing_law-pass-15",
    title: "Insmed Incorporated MSA: governing law (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "governing_law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in Delaware. The parties hereby waive any objection to such jurisdiction and venue.",
    note: "Delaware governing law, consistent with Iovance's standard. Passed.",
    addedAt: "2026-04-13T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-flag-01",
    title: "Sentinel Compliance Partners, Inc. MSA: client entity & address (flag)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "flag",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of January 15, 2026 (\"Effective Date\") by and between: Sentinel Compliance Partners, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics LLC, a Massachusetts limited liability company with its principal place of business at 100 Innovation Drive, Cambridge, MA 02142 (\"Client\").",
    note: "Wrong client entity name or stale address. Attorney flagged the misidentified counterparty.",
    addedAt: "2026-04-15T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-flag-02",
    title: "Twist Bioscience Corporation MSA: client entity & address (flag)",
    vendor: "Twist Bioscience Corporation",
    docType: "MSA",
    label: "flag",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of March 21, 2026 (\"Effective Date\") by and between: Twist Bioscience Corporation, a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics LLC, a Massachusetts limited liability company with its principal place of business at 100 Innovation Drive, Cambridge, MA 02142 (\"Client\").",
    note: "Wrong client entity name or stale address. Attorney flagged the misidentified counterparty.",
    addedAt: "2026-04-17T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-flag-03",
    title: "Telix Pharmaceuticals Limited renewal: client entity & address (flag)",
    vendor: "Telix Pharmaceuticals Limited",
    docType: "renewal",
    label: "flag",
    clauseTag: "corporate_address",
    text: "This Software License Renewal Agreement (\"Renewal Agreement\") is entered into as of May 15, 2026 (\"Renewal Effective Date\") by and between: Telix Pharmaceuticals Limited, a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics LLC, a Delaware corporation with its principal place of business at 100 Innovation Drive, Cambridge, MA 02142 (\"Client\"). Vendor and Client may be referred to individually as a \"Party\" and collectively as the \"Parties.\"",
    note: "Wrong client entity name or stale address. Attorney flagged the misidentified counterparty.",
    addedAt: "2026-04-19T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-flag-04",
    title: "Ultragenyx Pharmaceutical Inc. SOW: client entity & address (flag)",
    vendor: "Ultragenyx Pharmaceutical Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "corporate_address",
    text: "This STATEMENT OF WORK (\"SOW\") is entered into as of August 15, 2026 by and between: Ultragenyx Pharmaceutical Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics LLC, a Delaware corporation with its principal place of business at 100 Innovation Drive, Cambridge, MA 02142 (\"Client\").",
    note: "Wrong client entity name or stale address. Attorney flagged the misidentified counterparty.",
    addedAt: "2026-04-21T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-flag-05",
    title: "Ipsen S.A. change order: client entity & address (flag)",
    vendor: "Ipsen S.A.",
    docType: "change order",
    label: "flag",
    clauseTag: "corporate_address",
    text: "This CHANGE ORDER (\"Change Order\") is entered into as of July 27, 2026 by and between: Ipsen S.A., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics LLC, a Delaware corporation with its principal place of business at 100 Innovation Drive, Cambridge, MA 02142 (\"Client\").",
    note: "Wrong client entity name or stale address. Attorney flagged the misidentified counterparty.",
    addedAt: "2026-04-23T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-06",
    title: "Sentinel Compliance Partners, Inc. MSA: client entity & address (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of January 15, 2026 (\"Effective Date\") by and between: Sentinel Compliance Partners, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-07",
    title: "QuantumLeap Therapeutics, Inc. MSA: client entity & address (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of February 1, 2026 (\"Effective Date\") by and between: QuantumLeap Therapeutics, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-04-27T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-08",
    title: "Oracle America, Inc. MSA: client entity & address (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of July 12, 2026 (\"Effective Date\") by and between: Oracle America, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-04-29T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-09",
    title: "Stratos Cloud Infrastructure, Inc. MSA: client entity & address (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of March 1, 2026 (\"Effective Date\") by and between: Stratos Cloud Infrastructure, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-10",
    title: "Syneos Health, Inc. MSA: client entity & address (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of September 11, 2026 (\"Effective Date\") by and between: Syneos Health, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-03T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-11",
    title: "TitanSecure IT Solutions, Inc. MSA: client entity & address (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of January 1, 2026 (\"Effective Date\") by and between: TitanSecure IT Solutions, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-12",
    title: "BCRJ Clinical Research Unit MSA: client entity & address (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of September 17, 2026 (\"Effective Date\") by and between: BCRJ Clinical Research Unit, a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-13",
    title: "Pacific Life Sciences, Inc. MSA: client entity & address (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of February 15, 2026 (\"Effective Date\") by and between: Pacific Life Sciences, Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-09T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-14",
    title: "Insmed Incorporated MSA: client entity & address (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of July 05, 2026 (\"Effective Date\") by and between: Insmed Incorporated, a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-11T00:00:00.000Z",
  },
  {
    id: "seed-corporate_address-pass-15",
    title: "Karyopharm Therapeutics Inc. MSA: client entity & address (pass)",
    vendor: "Karyopharm Therapeutics Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "corporate_address",
    text: "This Master Services Agreement (\"Agreement\") is entered into as of July 16, 2026 (\"Effective Date\") by and between: Karyopharm Therapeutics Inc., a corporation with its principal place of business at the address set forth above (\"Vendor\"); and Iovance Biotherapeutics, Inc., a Delaware corporation with its principal place of business at 2201 Walnut Street, Suite 300, Philadelphia, PA 19103 (\"Client\").",
    note: "Client correctly identified as Iovance Biotherapeutics, Inc., a Delaware corporation at the Philadelphia address. Passed.",
    addedAt: "2026-05-13T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-flag-01",
    title: "Microsoft Corporation renewal: auto-renewal (flag)",
    vendor: "Microsoft Corporation",
    docType: "renewal",
    label: "flag",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Renewal Term, this Agreement shall automatically and perpetually renew for successive periods of twelve (12) months (each, a \"Renewal Period\"), unless Client provides written notice of non-renewal at least one hundred eighty (180) days prior to the expiration of the then-current term. Client waives any right to terminate any Renewal Period for convenience. The fees for any Renewal Period shall be increased by ten percent (10%) over the fees for the immediately preceding term at Vendor's sole discretion.",
    note: "Perpetual evergreen auto-renewal with no bounded exit. Attorney flagged.",
    addedAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-flag-02",
    title: "MabVax Therapeutics Holdings, Inc. renewal: auto-renewal (flag)",
    vendor: "MabVax Therapeutics Holdings, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Renewal Term, this Agreement shall automatically renew for successive periods of twelve (12) months (each, a \"Renewal Period\"). The fees for any Renewal Period shall be increased by five percent (5%) over the fees for the immediately preceding term unless otherwise agreed in writing by the Parties.",
    note: "Auto-renews with no non-renewal opt-out window. Attorney flagged.",
    addedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-flag-03",
    title: "ServiceNow, Inc. renewal: auto-renewal (flag)",
    vendor: "ServiceNow, Inc.",
    docType: "renewal",
    label: "flag",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Renewal Term, this Agreement shall automatically renew for successive periods of twelve (12) months (each, a \"Renewal Period\"). The fees for any Renewal Period shall be increased by five percent (5%) over the fees for the immediately preceding term.",
    note: "Perpetual evergreen auto-renewal with no bounded exit. Attorney flagged.",
    addedAt: "2026-05-19T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-04",
    title: "Sentinel Compliance Partners, Inc. MSA: auto-renewal (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-05",
    title: "QuantumLeap Therapeutics, Inc. MSA: auto-renewal (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-23T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-06",
    title: "Oracle America, Inc. MSA: auto-renewal (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-25T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-07",
    title: "Stratos Cloud Infrastructure, Inc. MSA: auto-renewal (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-27T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-08",
    title: "Syneos Health, Inc. MSA: auto-renewal (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-09",
    title: "TitanSecure IT Solutions, Inc. MSA: auto-renewal (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-05-31T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-10",
    title: "BCRJ Clinical Research Unit MSA: auto-renewal (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-11",
    title: "Pacific Life Sciences, Inc. MSA: auto-renewal (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-04T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-12",
    title: "Insmed Incorporated MSA: auto-renewal (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-13",
    title: "Karyopharm Therapeutics Inc. MSA: auto-renewal (pass)",
    vendor: "Karyopharm Therapeutics Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-14",
    title: "Transgene S.A. MSA: auto-renewal (pass)",
    vendor: "Transgene S.A.",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-10T00:00:00.000Z",
  },
  {
    id: "seed-auto_renewal-pass-15",
    title: "AC Immune SA MSA: auto-renewal (pass)",
    vendor: "AC Immune SA",
    docType: "MSA",
    label: "pass",
    clauseTag: "auto_renewal",
    text: "Upon expiration of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months unless either Party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.",
    note: "Auto-renews for like terms with a 60 to 90 day non-renewal opt-out. Passed.",
    addedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-flag-01",
    title: "Meridian BioPharma Solutions, Inc. SOW: invoice schedule math (flag)",
    vendor: "Meridian BioPharma Solutions, Inc.",
    docType: "SOW",
    label: "flag",
    clauseTag: "invoice_schedule_math",
    text: "This is a milestone-based fixed fee engagement. Payment shall be made upon completion and acceptance of each milestone as set forth below: | Description | Amount (USD) | Milestone 1 - Design & Planning | $80,000.00 | Milestone 2 - Build & IQ | $75,000.00 | Milestone 3 - OQ/PQ & Integration | $75,000.00 | Milestone 4 - Go-Live & Training | $50,000.00 | Total | $250,000.00 USD | Payment Terms: Milestone-based, payment due within 15 days of milestone acceptance. All fees are payable in U.S. dollars within forty-five (45) days of invoice date. | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with ...",
    note: "Milestone amounts do not sum to the contract total. Attorney flagged the arithmetic discrepancy.",
    addedAt: "2026-06-14T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-02",
    title: "Sentinel Compliance Partners, Inc. MSA: invoice schedule math (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $10,000.00 | $2,000.00 | $6,000.00 | Total | $150,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the performance of on-site Services. Vendor shall obtain Client's prior written approval for any single expense exceeding $1,000.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-16T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-03",
    title: "QuantumLeap Therapeutics, Inc. MSA: invoice schedule math (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $310,000.00 | $30,000.00 | $15,000.00 | $5,000.00 | Total | $360,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the performance of on-site Services. Vendor shall obtain Client's prior written approval for any single expense exceeding $1,000.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-18T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-04",
    title: "Stratos Cloud Infrastructure, Inc. MSA: invoice schedule math (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $95,000.00 | $15,000.00 | $10,000.00 | Total | $120,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the performance of on-site Services. Vendor shall obtain Client's prior written approval for any single expense exceeding $1,000.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-05",
    title: "TitanSecure IT Solutions, Inc. MSA: invoice schedule math (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $200,000.00 | $50,000.00 | $20,000.00 | $10,000.00 | Total | $280,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the performance of on-site Services. Vendor shall obtain Client's prior written approval for any single expense exceeding $1,000.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-22T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-06",
    title: "Pacific Life Sciences, Inc. MSA: invoice schedule math (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $380,000.00 | $45,000.00 | $15,000.00 | $10,000.00 | Total | $450,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the performance of on-site Services. Vendor shall obtain Client's prior written approval for any single expense exceeding $1,000.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-24T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-07",
    title: "Apexion Cloud Services, Inc. renewal: invoice schedule math (pass)",
    vendor: "Apexion Cloud Services, Inc.",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $400,000.00 | $15,000.00 | $5,000.00 | Total | $420,000.00 USD | Payment Terms: Net 45 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-26T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-08",
    title: "Helix Analytics Corporation renewal: invoice schedule math (pass)",
    vendor: "Helix Analytics Corporation",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $22,500.00 | $1,500.00 | Total | $24,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-28T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-09",
    title: "CryoVault Logistics, LLC renewal: invoice schedule math (pass)",
    vendor: "CryoVault Logistics, LLC",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $12,000.00 | $2,500.00 | $500.00 | Total | $15,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-10",
    title: "BioReliance Quality Solutions, Inc. renewal: invoice schedule math (pass)",
    vendor: "BioReliance Quality Solutions, Inc.",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $16,000.00 | $3,500.00 | $500.00 | Total | $20,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-02T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-11",
    title: "Veritas Data Corporation renewal: invoice schedule math (pass)",
    vendor: "Veritas Data Corporation",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $5,500.00 | $1,000.00 | $500.00 | Total | $7,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-04T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-12",
    title: "Sentinel Compliance Partners, Inc. renewal: invoice schedule math (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $120,000.00 | $20,000.00 | $10,000.00 | Total | $150,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-06T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-13",
    title: "Microsoft Corporation renewal: invoice schedule math (pass)",
    vendor: "Microsoft Corporation",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $160,000.00 | $12,000.00 | $8,000.00 | Total | $180,000.00 USD | Payment Terms: Net 60 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-08T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-14",
    title: "Salesforce, Inc. renewal: invoice schedule math (pass)",
    vendor: "Salesforce, Inc.",
    docType: "renewal",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "Description | Amount (USD) | $290,000.00 | $35,000.00 | $15,000.00 | $10,000.00 | Total | $350,000.00 USD | Payment Terms: Net 45 days from date of invoice. Vendor reserves the right to charge interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law on all amounts not paid when due.",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "seed-invoice_schedule_math-pass-15",
    title: "Nucleus Consulting Partners, LLC SOW: invoice schedule math (pass)",
    vendor: "Nucleus Consulting Partners, LLC",
    docType: "SOW",
    label: "pass",
    clauseTag: "invoice_schedule_math",
    text: "This is a time and materials engagement. Vendor shall perform the services on a time and materials basis at the rate of $185.00 per hour. Vendor shall provide monthly invoices with detailed time records. | Description | Amount (USD) | Phase 1 - Discovery & Design (200 hours @ $185/hr) | $37,000.00 | Phase 2 - Build & Configure (600 hours @ $185/hr) | $111,000.00 | Phase 3 - Testing (300 hours @ $185/hr) | $55,500.00 | Phase 4 - Deployment (200 hours @ $185/hr) | $37,000.00 | $15,000.00 | $19,500.00 | Total | $275,000.00 USD | Client shall reimburse Vendor for all reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with on-site work. Vendor ...",
    note: "Line-item amounts reconcile to the stated contract total. Passed.",
    addedAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-flag-01",
    title: "Hexaware Technologies, Inc. change order: order of precedence (flag)",
    vendor: "Hexaware Technologies, Inc.",
    docType: "change order",
    label: "flag",
    clauseTag: "order_of_precedence",
    text: "This Change Order amends the underlying Master Services Agreement but omits any order-of-precedence clause; nothing states which document controls if the Change Order and the MSA conflict, and the standard amendment-protection language is absent.",
    note: "Change order lacks an order-of-precedence clause. Attorney flagged and inserted one.",
    addedAt: "2026-07-14T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-02",
    title: "Sentinel Compliance Partners, Inc. MSA: order of precedence (pass)",
    vendor: "Sentinel Compliance Partners, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-16T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-03",
    title: "QuantumLeap Therapeutics, Inc. MSA: order of precedence (pass)",
    vendor: "QuantumLeap Therapeutics, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-18T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-04",
    title: "Oracle America, Inc. MSA: order of precedence (pass)",
    vendor: "Oracle America, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-20T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-05",
    title: "Stratos Cloud Infrastructure, Inc. MSA: order of precedence (pass)",
    vendor: "Stratos Cloud Infrastructure, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-22T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-06",
    title: "Syneos Health, Inc. MSA: order of precedence (pass)",
    vendor: "Syneos Health, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-24T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-07",
    title: "TitanSecure IT Solutions, Inc. MSA: order of precedence (pass)",
    vendor: "TitanSecure IT Solutions, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-26T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-08",
    title: "BCRJ Clinical Research Unit MSA: order of precedence (pass)",
    vendor: "BCRJ Clinical Research Unit",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-28T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-09",
    title: "Pacific Life Sciences, Inc. MSA: order of precedence (pass)",
    vendor: "Pacific Life Sciences, Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-07-30T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-10",
    title: "Insmed Incorporated MSA: order of precedence (pass)",
    vendor: "Insmed Incorporated",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-11",
    title: "Karyopharm Therapeutics Inc. MSA: order of precedence (pass)",
    vendor: "Karyopharm Therapeutics Inc.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-03T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-12",
    title: "Transgene S.A. MSA: order of precedence (pass)",
    vendor: "Transgene S.A.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-05T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-13",
    title: "AC Immune SA MSA: order of precedence (pass)",
    vendor: "AC Immune SA",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-07T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-14",
    title: "PolyPid Ltd. MSA: order of precedence (pass)",
    vendor: "PolyPid Ltd.",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-09T00:00:00.000Z",
  },
  {
    id: "seed-order_of_precedence-pass-15",
    title: "Novartis AG MSA: order of precedence (pass)",
    vendor: "Novartis AG",
    docType: "MSA",
    label: "pass",
    clauseTag: "order_of_precedence",
    text: "This Agreement, together with all SOWs, exhibits, and attachments, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions. This Agreement may not be amended or modified except by a written instrument signed by authorized representatives of both parties.",
    note: "Includes an order-of-precedence clause governing conflicts with the parent agreement. Passed.",
    addedAt: "2026-08-11T00:00:00.000Z",
  },
];
