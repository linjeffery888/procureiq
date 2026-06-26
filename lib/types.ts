// ProcureIQ unified data model. ONE platform, ONE shared record, TWO modules.
//
// The whole product rests on ContractExtraction: a contract is read ONCE into
// this structured shape, then every downstream surface reuses it instead of
// re-reading the PDF by hand. ContractIQ (the legal first pass) PRODUCES the
// record (vendor, value, paymentSchedule, terms, findings). BudgetIQ (invoice
// matching + financial planning) CONSUMES the same spine (paymentSchedule,
// totalValue) as its invoice match key and accrual basis. The Knowledge module
// indexes past contracts into a precedent corpus that grounds the review.
//
// This file is the single source of truth for both modules. There is no second
// copy: the data layer is where the two modules are unified.

// =====================================================================
// SHARED SPINE: ContractExtraction (written by ContractIQ)
// =====================================================================
export type Severity = "ok" | "review" | "flag";

export interface ExtractedTerm {
  key: string;            // e.g. "net_payment_terms"
  label: string;          // human label, e.g. "Net payment terms"
  value: string | null;   // what the contract actually says
  sourceQuote?: string;   // the contract language this was read from, if known
  page?: string;          // where it was found, if known
}

export interface PlaybookFinding {
  termKey: string;
  label: string;
  found: string | null;       // value extracted from the contract
  standard: string;           // Iovance's preferred / acceptable position
  severity: Severity;         // ok | review | flag
  rationale: string;          // why this was flagged
  suggestedRedline?: string;  // first-pass language to propose back
}

export interface ContractExtraction {
  vendor: string | null;
  counterpartyType: string | null; // SaaS, MSA, SOW, change order, renewal, NDA
  totalValue: number | null;        // contract value in USD; anchors the budget line
  currency: string | null;
  startDate: string | null;
  endDate: string | null;
  termMonths: number | null;
  paymentSchedule: string | null;   // the match key + accrual basis for BudgetIQ
  autoRenewal: boolean | null;
  governingLaw: string | null;
  terms: ExtractedTerm[];
  findings: PlaybookFinding[];
  summary: string;                  // 1-2 sentence plain-language summary
  contractId: string | null;        // this document's own Contract No., when it prints one
  parentReference: ParentReference | null; // the parent this doc cites, when it is an amendment
}

// =====================================================================
// CONTRACT LINKING: amendments <-> their parent agreement
// =====================================================================
// A change order, SOW, addendum, or renewal modifies a parent agreement and
// must be reviewed AS A UNIT with it: the parent supplies the inherited terms,
// and only the clauses THIS instrument actually changes are measured against
// the playbook. To link reliably we need a real identifier on the parent (its
// Contract No.) and a citation to that identifier on the child. Two separate
// agreements with the same vendor are told apart by their Contract No., not by
// the vendor name, so an amendment links to exactly one parent and never to an
// antiquated sibling from the same vendor.

// What kind of instrument a document is, for linking purposes.
export type InstrumentType =
  | "base"        // standalone MSA, license, or NDA - nothing to link up to
  | "amendment"   // change order, addendum, amendment
  | "sow"         // statement of work issued under a parent MSA
  | "renewal";    // renewal of a prior agreement

// The parent a child document cites, captured verbatim from the contract text.
// The resolver, not the extractor, decides whether the citation matches a known
// parent; this is only what the document claims its parent is.
export interface ParentReference {
  isAmendment: boolean;              // true if this doc modifies/depends on a parent
  instrumentType: InstrumentType;    // what kind of instrument this doc is
  parentContractId: string | null;   // the parent's Contract No. as cited, if any
  parentTitle: string | null;        // e.g. "Master Services Agreement"
  parentDate: string | null;         // the parent's date as cited, if any
  counterpartyEntity: string | null; // the counterparty named in the citation
  rawReference: string | null;       // the sentence the citation was read from
}

// How confidently the resolver tied a child to a known parent.
export type LinkConfidence = "high" | "medium" | "none";

export type LinkStatus =
  | "linked"           // matched a known parent with high confidence
  | "needs_confirm"    // a probable match a human should confirm
  | "parent_not_found" // cites a parent that is not in the known set
  | "standalone";      // not an amendment; nothing to link

// The outcome of resolving one document's parentReference against the known set
// (the uploaded batch plus the corpus). Computed by lib/contractLinking.ts, not
// by the extractor, because it depends on the other documents present.
export interface ParentResolution {
  status: LinkStatus;
  confidence: LinkConfidence;
  matchedContractId: string | null; // the resolved parent's contractId, when linked
  matchedTitle: string | null;      // resolved parent's title, for the UI
  rationale: string;                // plain-English why this link (or non-link)
}

// How the extraction was produced. The hero path calls Claude live; the offline
// path is a deterministic heuristic so the demo never goes dark if no key is set
// or the API call fails mid-present-back. The UI labels which one ran so we never
// imply the model did work it did not.
export type ExtractionEngine = "live" | "offline-heuristic";

// When the Knowledge module grounds a review, the precedents that were retrieved
// are recorded here so the UI can show what evidence the review leaned on. The
// deterministic playbook still owns the pass/flag decision; retrieval is only
// supporting evidence.
export interface RetrievalContext {
  used: boolean;            // was precedent retrieval applied to this review
  corpusSize: number;       // how many indexed precedents were available
  precedents: RetrievedPrecedent[];
}

export interface ExtractionMeta {
  engine: ExtractionEngine;
  model: string | null;     // model id when live, null offline
  latencyMs: number;
  note: string;             // human-readable provenance line for the UI
  retrieval?: RetrievalContext; // precedent grounding, when the Knowledge corpus is used
}

// What POST /api/extract returns: the spine plus provenance metadata.
export interface ExtractionResponse extends ContractExtraction {
  _meta: ExtractionMeta;
}

// =====================================================================
// BUDGETIQ: invoice / PO matching (consumes the spine)
// =====================================================================
export interface PurchaseOrder {
  poNumber: string;
  vendor: string;
  workOrder: string;        // the sharpest shared object: extracted from the SOW
  contractValue: number;
  remaining: number;
}

export interface Invoice {
  invoiceNumber: string;
  vendor: string;
  amount: number;
  poNumberClaimed: string | null; // what the invoice says
  lineItems: string[];
  receivedDate: string;
}

// How a given decision was reached. The money decision (budget check) is always
// deterministic and auditable; AI only ever proposes a fuzzy PO link or drafts
// the human-readable triage, never the final over_budget/match call. A human can
// override any row, and the override is recorded as its own audit step.
export type DecisionSource = "deterministic" | "ai" | "human";

export type MatchStatus = "matched" | "review" | "over_budget" | "no_po";

// One line in the audit trail for a single invoice. The trail is what makes the
// automation defensible: every cleared invoice can answer "why" without "the
// model felt like it."
export interface AuditStep {
  label: string;            // "PO link", "Budget check", "Vendor resolution"
  source: DecisionSource;
  detail: string;           // plain-English what happened
  confidence?: number;      // 0..1, present when an AI step
}

export interface MatchResult {
  invoice: Invoice;
  matchedPo: PurchaseOrder | null;
  status: MatchStatus;
  confidence: number;             // overall 0..1
  resolutionSource: DecisionSource; // how the PO link was established
  explanation: string;            // why this status, in plain English
  suggestedResolution: string;    // next action for a human; empty if auto-cleared
  audit: AuditStep[];
  needsHuman: boolean;            // anything that did not auto-clear
  // The deterministic dedup verdict against the rest of the batch (the receipt
  // ledger), present when this invoice relates to another (duplicate, revision,
  // credit). A payment-risk duplicate forces the row into the exception queue.
  // See lib/dedup.ts and lib/triageDedup.ts.
  duplicate?: import("./dedup").DuplicateCheck;
}

// How the triage was produced. The hero path calls Claude live to resolve fuzzy
// invoice/PO references and draft exception triage; the offline path is a
// deterministic engine so the app never goes dark if no key is set or the call
// fails. The UI labels which one ran so we never imply the model did work it did
// not, and the deterministic money decision is identical under both.
export type TriageEngine = "live" | "offline-deterministic";

export interface TriageMeta {
  engine: TriageEngine;
  model: string | null;     // model id when live, null offline
  latencyMs: number;
  note: string;             // human-readable provenance line for the UI
}

// What POST /api/triage returns: the enriched, audited match results plus
// provenance metadata.
export interface TriageResponse {
  results: MatchResult[];
  meta: TriageMeta;
}

// The last triage run, persisted to disk so it survives a restart and the page
// can show it without re-running. `batchKey` is the signature of the batch it ran
// against (see lib/triageKey.ts); the UI compares it to the current batch to flag
// a stale result. Client-safe; the disk store is lib/triageResultStore.ts.
export interface PersistedTriage {
  result: TriageResponse | null;
  batchKey: string | null;
  ranAt: string | null; // ISO timestamp of the run
}

// =====================================================================
// BUDGETIQ: financial planning (accruals + reforecast)
// =====================================================================
export interface VendorBudgetLine {
  vendor: string;
  annualBudget: number;
  monthlyExpected: number[];  // Jan..Dec
  actualsToDate: number[];    // Jan..Dec, zero-filled forward
  paymentSchedule: string;    // from ContractExtraction when available
}

export interface AccrualSuggestion {
  vendor: string;
  month: string;
  predictedInvoice: number;
  basis: string;              // why this number
  needsOutreach: boolean;     // true if no predictable schedule
}

// =====================================================================
// BUDGETIQ: document ingest (uploaded invoice / budget PDFs)
// =====================================================================
// Ben's workflow today is manual: AP keys PDF invoices into Points Purchasing
// one by one, and finance re-keys vendor actuals and estimates into budget
// spreadsheets every quarter. These shapes let an uploaded PDF be parsed ONCE
// into structured rows that flow into the same matching and accrual surfaces,
// instead of being retyped by hand. The engine is labeled, like every other
// surface, so we never imply the model parsed a document it did not.
export type IngestEngine = "live" | "offline-heuristic";

export interface IngestMeta {
  engine: IngestEngine;
  model: string | null;     // model id when live, null offline
  latencyMs: number;
  note: string;             // human-readable provenance line for the UI
}

// What POST /api/ingest returns for kind="invoice": one parsed invoice ready to
// drop into the triage batch, plus provenance. The parsed invoice then runs the
// same deterministic + AI matching as any seeded invoice.
//
// `duplicate` is the deterministic dedup verdict against the receipt ledger,
// computed at ingest time so a re-sent or double-submitted invoice is flagged for
// a human before it ever reaches the matching queue. See lib/dedup.ts. The shape
// is imported there to keep the engine self-contained; re-exported via the
// route's response.
//
// `id` is the persisted upload's id, so the client can track and delete it.
export interface InvoiceIngestResponse {
  id: string;
  invoice: Invoice;
  duplicate: import("./dedup").DuplicateCheck;
  _meta: IngestMeta;
}

// A human's disposition of an exception in the matching queue. Persisted per
// invoice so a partially-reviewed queue survives navigation and restart.
export type HumanAction = "approved" | "override";

// The full persisted disposition of one exception: the decision plus, for a
// manual correction (override), the PO and note the reviewer hand-entered. Keyed
// by invoice number in the decision store (lib/decisionStore.ts). Client-safe.
export interface StoredDecision {
  decision: HumanAction;
  manualPo?: string;
  manualNote?: string;
}

// One persisted uploaded invoice: the full parsed invoice plus the metadata the
// matching queue needs to restore it across sessions. Client-safe (no fs); the
// disk-backed store that produces these lives in lib/uploadStore.ts.
export interface StoredUpload {
  id: string;
  invoice: Invoice;
  sourceName: string;
  engine: IngestEngine;
  duplicate: import("./dedup").DuplicateCheck;
  decision: HumanAction | null; // null = undecided / waiting for review
  uploadedAt: string;           // ISO timestamp
}

// One parsed budget figure: a vendor and the amount read off an uploaded
// actuals export or vendor estimate, mapped downstream to a budget line so the
// planner does not re-key it.
export interface BudgetIngestLine {
  vendor: string;
  amount: number;
  period: string | null;    // e.g. "June 2026", when the document states one
  note: string;             // what the figure is, e.g. "June actual"
}

export interface BudgetIngestResponse {
  lines: BudgetIngestLine[];
  _meta: IngestMeta;
}

// What POST /api/ingest returns for kind="budget-plan": the parsed budget itself,
// one VendorBudgetLine per vendor, read off an uploaded CSV/XLSX/PDF budget so the
// planner does not hand-key the budget table. These flow into the live budget
// store (data/budget.json) and become the basis every accrual and reforecast runs
// against. `period`/`fiscalYear` are captured when the document states them.
export interface BudgetPlanIngestResponse {
  lines: VendorBudgetLine[];
  period: string | null;
  warnings: string[];      // rows skipped or columns missing, surfaced to the planner
  _meta: IngestMeta;
}

// Where the live budget came from: the shipped synthetic seed, or a budget the
// planner ingested/edited. Surfaced in the UI so it is always clear whether the
// numbers on screen are the demo seed or a real upload.
export type BudgetSource = "seed" | "ingested";

// One uploaded finance actual, matched to a budget line and persisted so the
// accrual draft and the reforecast variance it feeds survive a reload / restart.
// Keyed by normalized vendor (one actual per vendor; the latest upload wins).
// Client-safe; the disk-backed store lives in lib/budgetActualsStore.ts.
export interface PersistedBudgetActual {
  vendorKey: string;   // normalized vendor (the budget line it lands on)
  vendor: string;      // vendor name as parsed from the export
  amount: number;
  period: string | null;
  note: string;
  sourceName: string;
  engine: IngestEngine;
  uploadedAt: string;  // ISO timestamp
}

// =====================================================================
// KNOWLEDGE: precedent corpus (RAG) + training/eval
// =====================================================================
// How a past contract was dispositioned by the attorney. The corpus is
// segmented so retrieval can ground "what is Iovance's standard": pass cases
// (renewals / accepted big-corp terms) and flag cases (the named deviations).
// "unlabeled" precedents are indexed but not yet dispositioned.
export type CorpusLabel = "pass" | "flag" | "unlabeled";

// One document indexed into the precedent store. The embedding is computed once
// at ingest time and persisted; retrieval is cosine kNN over these vectors.
export interface CorpusDoc {
  id: string;
  title: string;            // human label, e.g. "CryoLogix MSA renewal 2025"
  vendor: string | null;
  docType: string | null;   // MSA, SOW, change order, renewal, NDA
  label: CorpusLabel;       // attorney disposition; also the eval ground truth
  clauseTag: string | null; // which clause this precedent is strongest on
  text: string;             // the precedent text (synthetic for the prototype)
  note: string;             // why it was labeled this way
  addedAt: string;          // ISO timestamp
  embedding?: number[];     // normalized vector, present once indexed
}

// A precedent surfaced for a contract under review, with its similarity score.
export interface RetrievedPrecedent {
  id: string;
  title: string;
  vendor: string | null;
  label: CorpusLabel;
  clauseTag: string | null;
  note: string;
  score: number;            // cosine similarity 0..1
  snippet: string;          // short excerpt for the UI
}

// What POST /api/corpus returns after an ingest or a retrieval/eval run. Kept
// small and serializable so the client can render indexing status without the
// raw vectors.
export interface CorpusStatus {
  total: number;
  passCount: number;
  flagCount: number;
  unlabeledCount: number;
  indexed: number;          // how many have an embedding
  embeddingModel: string;   // the local model id, or "unavailable"
  lastUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Audit trail. Every place a human touches a decision (commits a reviewed
// contract, approves or overrides an invoice match, reopens a closed item,
// applies actuals to the budget) appends one immutable AuditEvent. The log is
// append-only and persisted to disk so the record of "who decided what, when"
// survives reloads and restarts, and is exportable as a spreadsheet for a
// compliance reviewer. This is the auditable human-touchpoint trail.
export type AuditModule = "ContractIQ" | "BudgetIQ";

// Coarse machine-readable category of the touchpoint, so the trail can be
// filtered and the dashboard can count by kind without parsing free text.
export type AuditAction =
  | "contract-committed"   // a reviewed contract crossed into the shared record
  | "invoice-approved"     // human accepted the suggested match/resolution
  | "invoice-corrected"    // human took it over and entered a PO/resolution
  | "invoice-reopened"     // human reversed a prior decision
  | "budget-actuals"       // human applied uploaded actuals to the forecast
  | "budget-updated"       // human ingested or edited the budget itself
  | "thresholds-changed"   // human edited the clause rule thresholds
  | "po-updated";          // human edited a PO register entry (terms / remaining)

export interface AuditEvent {
  id: string;              // "evt-<seq>", unique across clears
  at: string;              // ISO timestamp of the touchpoint
  module: AuditModule;     // which product surface produced it
  surface: string;         // human label, e.g. "Contract review", "Invoice check"
  actor: string;           // human-in-the-loop marker, e.g. "attorney", "ap-analyst"
  action: AuditAction;     // machine category (see above)
  actionLabel: string;     // human label, e.g. "Approved match", "Manual correction"
  subject: string;         // what was acted on: vendor, invoice no., or contract name
  outcome: string;         // resulting disposition, e.g. "clean-pass", "override", "resolved"
  detail: string;          // free-text context for the reviewer
}
