# ProcureIQ Product and UI Specification

Version 1.0 - authored 2026-06-24, grounded in the working prototype in this repo.

---

## 0. How to use this document

This spec is the single source of truth for a full UI rebuild of ProcureIQ in
Claude Design, followed by reconnection of the new UI to the existing backend.

The work happens in two passes, on purpose:

1. **Design pass.** Rebuild every screen described in Section 7 against the
   data contracts in Sections 6 and 10. The backend stays as-is. Treat the API
   request and response shapes as fixed; build the UI to consume them.
2. **Reconnection pass.** Wire the new components to the five API routes in
   Section 10. Because the contracts are frozen here, reconnection is a wiring
   job, not a redesign of the engine.

If a design decision and this document disagree, this document wins for data
shape and product principles. Visual treatment is open for the design pass to
improve, as long as it honors the constraints in Section 12.

**Hard constraints that apply to every screen and every string** (Section 12
expands these): no em-dash characters anywhere in copy or code; no real Iovance
data, only the synthetic data in this repo; a human confirms every consequential
decision; money decisions stay deterministic and auditable; every dollar figure
carries a provenance tag; the UI labels whether the live or offline engine ran.

---

## 1. Product vision and thesis

ProcureIQ is one internal platform for Iovance Biotherapeutics that carries a
single vendor contract record across its whole life, from legal review at
signing through accounts-payable matching and quarter-close accrual. It is built
as **one shell over two modules**, not as a merged super-app.

- **ContractIQ** is the legal first-pass review module. It reads a contract once
  against Iovance's standard-terms playbook, clears the routine majority, and
  surfaces only what deviates for an attorney.
- **BudgetIQ** is the finance and procurement module. It matches invoices to
  purchase orders and work orders, and it drafts quarter-end accruals and the
  reforecast.

The thesis, stated the same way on the dashboard and in every present-back:

> **Unify the data, not the teams.** One contract is read once at signing, and
> the structured record it produces flows downstream so AP and finance never
> re-read the contract by hand. The unification is in the data. The deployment
> stays modular: in production each module integrates with its own team's system
> of record, and we never force legal and finance into one tool.

This framing protects the sales and trust story. ProcureIQ is not replacing the
legal document management system, Oro, or Points Purchasing. It sits over them
and moves one clean record between them.

---

## 2. The throughline (the spine of the product)

Every screen is a station on one lifecycle. The dashboard renders this as a
ribbon, and the rebuild should keep it visible as the orienting metaphor.

```
ContractIQ            Procurement        BudgetIQ                BudgetIQ
(signing)             (PO raised)        (invoice time)          (quarter close)
Contract extracted -> PO / work order -> Invoice matched     -> Accrual drafted
        |                  |                   |                      |
   ContractExtraction record (vendor, paymentSchedule, totalValue, terms, findings)
   is written once and read at every later station.
```

The connective tissue is the **shared ContractExtraction record** (Section 6).
ContractIQ writes it on commit. BudgetIQ reads it two ways:

- **Invoice matching** uses `vendor` plus `paymentSchedule` plus `totalValue` as
  the match key and budget anchor.
- **Financial planning** uses `paymentSchedule` as the accrual basis.

When a record has been committed for a vendor, the BudgetIQ screens light up a
"ContractIQ record" tag on that vendor's rows to make the handoff visible.

---

## 3. Personas and the jobs they hire ProcureIQ for

| Persona | Module | Job to be done |
| --- | --- | --- |
| **Attorney / legal reviewer** | ContractIQ | "Read this contract against our playbook, clear the routine parts, and show me only what deviates, with the redline language and the precedent behind it. I confirm before execution." |
| **AP specialist** | BudgetIQ Invoice matching | "Match every invoice to its PO and work order, auto-clear the clean ones, and hand me only the exceptions with a drafted resolution and an audit trail." |
| **Finance lead / FP&A** | BudgetIQ Financial planning | "Draft the quarter-end accrual from the contract's payment schedule, pull actuals, and flag only the vendors that need outreach. I sign the reforecast." |
| **Knowledge owner (attorney)** | Knowledge | "Curate the precedent corpus, label past dispositions, and show me how reliably retrieval agrees with my past calls." |
| **Ben (sponsor / exec)** | Impact | "Show me the business case: hours recovered and throughput, every figure tagged as verified, assumption, or estimate." |

Across all of these, the human is always in the loop on the consequential
decision. The AI clears volume and drafts; it never disposes.

---

## 4. Information architecture and navigation

One top navigation bar, persistent on every screen. The brand mark reads
**ProcureIQ**, with the tagline "Iovance IT - one contract record, two modules."

Six routes, in nav order:

| Label | Route | Module | Purpose |
| --- | --- | --- | --- |
| Dashboard | `/` | Shell | Orientation, the thesis, the lifecycle ribbon, module entry cards. |
| ContractIQ | `/contract-review` | ContractIQ | First-pass contract review against the playbook. |
| BudgetIQ - Invoices | `/invoice-matching` | BudgetIQ | Invoice to PO matching and the exception queue. |
| BudgetIQ - Planning | `/financial-planning` | BudgetIQ | Accrual drafting and reforecast vs budget. |
| Knowledge | `/knowledge` | Shell (serves ContractIQ) | The precedent corpus, indexing, retrieval, and eval. |
| Impact | `/impact` | Shell | The ROI / business case, quarantined off the working surfaces. |

The active link is highlighted by current path. The two BudgetIQ entries are
visibly grouped as one module with two sections, reinforcing "two modules, four
working surfaces" rather than four unrelated tools.

---

## 5. Hybrid AI architecture and provenance

Every module follows the same pattern, and the UI must make it legible.

**Deterministic core owns the consequential decision.** Rules decide the
pass/flag on a contract clause and the matched/over-budget status on an invoice.
These are auditable and reproducible.

**AI proposes, it does not dispose.** The model does the fuzzy work the rules
cannot: extracting structured fields from free text, drafting plain-English
triage, proposing a vendor-to-PO link for a messy vendor name, and writing
suggested redline language. Every AI proposal is then re-checked or finalized by
the deterministic core, and a human approves it.

**Offline fallback is always present.** No screen goes dark without a key or
network. If `ANTHROPIC_API_KEY` is absent or the API errors, a deterministic or
heuristic engine produces a complete result, and the money decision is identical
to the live path.

**Provenance is shown, never implied.** Every engine response carries a meta
block. The UI renders a badge:

- **Live** (green dot): the model ran. Show the model name and the latency.
- **Offline** (muted dot): the deterministic or heuristic engine ran. Show why
  (no key, parse failure, API error) from the meta note.

Source tags appear at the row and audit-step level:

- `rule` / `deterministic` - a rule decided it.
- `AI` - the model proposed it.
- `human` - a person approved, overrode, accepted, or dismissed it.

This three-way provenance (deterministic, AI, human) is the trust spine of the
product. The redesign must keep it prominent, not bury it.

### Meta block shape (present on extract and triage responses)

```ts
ExtractionMeta / TriageMeta {
  engine: "live" | "offline-heuristic" | "offline-deterministic",
  model: string | null,        // e.g. "claude-sonnet-4-6", null when offline
  latencyMs: number,
  note: string,                // human-readable reason, shown next to the badge
  retrieval?: {                // present on ContractIQ when Knowledge grounding is on
    used: boolean,
    corpusSize: number,
    precedents: RetrievedPrecedent[]
  }
}
```

---

## 6. The shared record model (ContractExtraction)

This is the spine. ContractIQ produces it; BudgetIQ consumes it. The store is an
in-memory record keyed by a normalized vendor name (a demo convenience standing
in for production integration between two systems of record).

```ts
ContractExtraction {
  vendor: string | null
  counterpartyType: string | null     // e.g. "MSA", "SaaS", "change order"
  totalValue: number | null
  currency: string | null
  startDate: string | null
  endDate: string | null
  termMonths: number | null
  paymentSchedule: string | null       // reused downstream as match key + accrual basis
  autoRenewal: boolean | null
  governingLaw: string | null
  terms: ExtractedTerm[]
  findings: PlaybookFinding[]
  summary: string
}

PlaybookFinding {
  termKey: string                       // matches a playbook rule key or consistency-check key
  label: string
  severity: "ok" | "review" | "flag"
  found: string | null                  // what the contract actually says
  standard: string                      // the Iovance acceptable position
  rationale: string
  suggestedRedline: string | null
}

ExtractedTerm { key, label, value }     // flat extracted field list
```

The shared store entry wraps it:

```ts
SharedRecord {
  id: string
  vendor: string | null
  extraction: ContractExtraction
  sourceName: string                    // e.g. the uploaded file name
  committedAt: string
  committedBy: string
}
```

Vendor normalization (used to match a record to invoices and budget lines):
lowercase, strip punctuation, drop corporate suffix tokens (inc, llc, ltd,
limited, corp, corporation, co, company, plc, gmbh), collapse whitespace. This
resolves "Helix Analytics, Inc." to the same key as "Helix Analytics".

---

## 7. Per-screen specifications

Each screen below gives: purpose, the data it reads and writes, its primary
workflow, its feature inventory, and the states the UI must handle (empty,
loading, live, offline, error). Build each as a self-contained surface.

### 7.1 Dashboard (`/`)

**Purpose.** Orient a first-time viewer in fifteen seconds: what ProcureIQ is,
the one-record thesis, the lifecycle, and a door into each working surface.

**Reads / writes.** Static. No API calls. Pure presentation.

**Content blocks.**

1. **Lede.** The thesis: one platform, one shared contract record, two modules;
   the unification is in the data, not the teams.
2. **Synthetic-data disclaimer.** A standing band stating all data is synthetic,
   no real Iovance records are used.
3. **Lifecycle ribbon.** The four-station throughline from Section 2, with each
   station tagged to its module (ContractIQ at signing, Procurement raising the
   PO, BudgetIQ at invoice time, BudgetIQ at quarter close).
4. **Module entry cards.** Four cards: ContractIQ, BudgetIQ - Invoice matching,
   BudgetIQ - Financial planning, Knowledge. Each card has an icon, a one-line
   description, and links to its route.
5. **Business-case link.** A clear path to `/impact` ("See the business case"),
   kept separate so the working surfaces never read as a sales pitch.
6. **Production-target footnote.** Names the production targets to reinforce the
   modular story: AWS Bedrock in-VPC for AI and embeddings, the legal DMS / Oro
   for ContractIQ, Points Purchasing and finance for BudgetIQ.

**States.** Single static state. No loading or error paths.

---

### 7.2 ContractIQ - contract review (`/contract-review`)

**Purpose.** First-pass review of a contract against Iovance's standard-terms
playbook. The AI reads the contract once, classifies each clause as ok / review
/ flag, drafts redline language, and (optionally) grounds each call in retrieved
precedent. An attorney confirms and commits the record.

**Reads.** `POST /api/extract` for the review; `POST /api/upload` for file text
extraction; `POST /api/records` to commit.

**Writes.** A committed `SharedRecord` (on commit), which is what BudgetIQ later
reads.

**Primary workflow.**

1. Get a contract in. Three ways: drop or choose a file (PDF, DOCX, TXT, choose a
   folder for batch), paste text, or load one of three bundled samples (MSA,
   SaaS, change order).
2. Optionally toggle **"Ground this review in Iovance precedent"** (the Knowledge
   module). When on, the route retrieves the top precedents as evidence.
3. Run the first-pass review. The result renders:
   - The engine badge (live vs offline) with the meta note and latency.
   - If grounding was used: a "Grounded in Iovance precedent" panel showing the
     retrieved precedents with their label pill (pass/flag) and similarity score.
   - A header tally: N flagged, N to review, N clean.
   - An extracted-fields summary table (vendor, type, value, term, payment,
     auto-renew, governing law, dates).
   - A **Consistency checks** strip (the three Ben-requested checks: invoice
     schedule arithmetic, key dates including backdating, corporate entity and
     address), rendered separately from clause findings.
   - **Findings against the playbook**, sorted flag first, then review, then ok.
     Each finding shows what was found, the Iovance standard, the rationale, and
     a suggested redline. The attorney can **Accept** or **Dismiss** each finding
     (a human disposition, tagged as such).
   - A **downstream handoff** panel mapping the three fields BudgetIQ reuses
     (paymentSchedule, totalValue, vendor) to what each becomes downstream.
4. Commit to the shared record. The committed vendor is confirmed back.

**Feature inventory.** Drag-and-drop and folder upload; per-file upload status
rows with click-to-load; three sample contracts; knowledge-grounding toggle;
severity-sorted findings; per-finding accept/dismiss; consistency-check strip;
extracted-fields table; downstream-handoff explainer; commit-to-record action.

**States.**

- *Empty / initial.* Sample MSA preloaded in the textarea so the screen is never
  blank.
- *Uploading.* "Extracting text..." on the dropzone; per-file rows resolve to ok
  or error with a note.
- *Reviewing.* Button shows "Reviewing..."; inputs disabled below the min length
  (40 characters).
- *Live result.* Green badge, model name, latency, full findings.
- *Offline result.* Muted badge ("Offline heuristic"), meta note explains why;
  findings still render from the heuristic engine.
- *Error.* Inline error message; the input is preserved.
- *Committed.* The commit button is replaced by a "Committed to shared record"
  confirmation with the vendor name.

**AI vs deterministic boundary.** The model extracts fields and classifies
clauses and drafts redlines. The playbook defines the standard each clause is
judged against. The attorney owns the final disposition (accept/dismiss) and the
commit.

---

### 7.3 BudgetIQ - invoice matching (`/invoice-matching`)

**Purpose.** Auto-match each invoice to its PO and work order, clear the clean
majority, and surface only the exceptions, each with a drafted resolution and a
full audit trail. The money decision is deterministic; a human approves every
exception before payment.

**Reads.** `POST /api/triage` (returns the full result set and meta); `GET
/api/records` (the committed ContractIQ records, to flag record-backed rows).

**Writes.** Nothing server-side. Human decisions (approve / override / reopen)
are local UI state in the prototype.

**Primary workflow.**

1. On load, run triage and fetch records in parallel.
2. Show a **"Matched against the record ContractIQ extracted"** panel: the
   committed records (vendor, payment schedule, total value, source). If none are
   committed yet, explain that the queue runs off the seeded POs until a record
   is committed.
3. Show the engine badge (live vs offline), the meta note, latency, and a
   **Re-run triage** button.
4. Show a one-line summary: "Auto-cleared X of N - Y need a human - Z backed by a
   committed record."
5. Render the full results table: invoice, vendor (with a "ContractIQ record" tag
   when record-backed), amount, PO / work order, resolved-by source tag (rule /
   AI / human), confidence, and a status pill (matched / review / over budget /
   no po). Human decisions tag the row.
6. Render the **Exception queue** (only rows needing a human). Each exception
   shows the explanation, the suggested resolution, and an **audit trail** of
   steps, each tagged by source (rule / AI / human) with the detail and any
   confidence. The reviewer can **Approve suggestion**, **Override / handle
   manually**, or **Reopen** a decided exception. A human decision is appended to
   the audit trail.

**Feature inventory.** Auto-run on load; re-run; record-backed flagging;
status-pill table; confidence display; per-exception audit trail; approve /
override / reopen controls; live vs offline badge.

**States.**

- *Loading.* "Running triage..." heading; table absent until first result.
- *Live.* Green badge, model name; AI resolved the fuzzy-vendor tail.
- *Offline deterministic.* Muted badge; only rule-resolvable invoices matched;
  the fuzzy tail routed to humans (this is the visible AI lift when the key is
  set).
- *No committed records.* The handoff panel explains the queue runs off seeded
  POs.
- *With committed records.* Matching rows show the "ContractIQ record" tag and
  the backed count rises.
- *Error.* Inline error; re-run available.

**AI vs deterministic boundary.** The deterministic core links clean invoices by
exact PO or normalized vendor and runs every budget check. AI is consulted only
for the leftover exception queue, where it proposes a fuzzy vendor-to-PO link
with a confidence and drafts triage. The final status and budget call are always
recomputed deterministically, so a hallucinated PO is simply discarded.

---

### 7.4 BudgetIQ - financial planning (`/financial-planning`)

**Purpose.** Draft the quarter-end accrual from each contract's payment schedule,
auto-pull actuals, and flag only the vendors that genuinely need outreach.
Finance confirms every accrual and signs the reforecast.

**Reads.** `GET /api/records` (to use a committed payment schedule as the accrual
basis where available). Budget lines are bundled synthetic data.

**Writes.** Nothing. Confirmation is the finance lead's act outside the prototype.

**Primary workflow.**

1. Fetch committed records on load.
2. Show an explainer: each accrual basis is the `paymentSchedule` field, reused
   here instead of emailing the vendor; predictable schedules auto-accrue, only
   usage-based vendors need outreach. State how many committed records back the
   drafts.
3. **Draft accruals (current quarter close).** A table of vendor, predicted
   invoice (the current month's expected amount), the basis (which says whether
   the schedule came from a committed ContractIQ record or the seeded budget
   line), and an action pill: "auto-accrue" for predictable monthly/quarterly
   schedules, "confirm w/ vendor" for usage-based ones. Record-backed vendors
   show the "ContractIQ record" tag.
4. **Reforecast vs budget.** A table of vendor, annual budget, actuals YTD,
   projected year-end (actuals plus remaining expected), and variance (red when
   over, green when under).

**Feature inventory.** Record-backed accrual basis; predictable vs usage-based
classification; auto-accrue vs confirm action; YTD and year-end projection;
variance coloring; record-backed tagging.

**States.**

- *No committed records.* Runs off seeded budget lines; the explainer says so.
- *With committed records.* The accrual basis cites the committed record and the
  count is shown.
- This screen has no live/offline AI engine; it is deterministic projection over
  the schedule. No loading spinner is strictly required, but handle the brief
  records fetch gracefully.

**AI vs deterministic boundary.** Entirely deterministic. The "AI" value here is
upstream: the schedule was read once by ContractIQ, so finance does not re-key it.

---

### 7.5 Knowledge - the precedent corpus and RAG (`/knowledge`)

**Purpose.** Curate the precedent corpus that ContractIQ retrieves as evidence,
index it into a vector space, label past dispositions, and report how reliably
retrieval agrees with the attorney's past calls. This is the grounding engine
behind ContractIQ's "Ground this review in precedent" toggle.

**Reads / writes.** `GET /api/corpus` (status plus docs); `POST /api/corpus` with
an `action` of `index` | `add` | `label` | `retrieve` | `evaluate`; `POST
/api/upload` for staging new documents from files.

**Primary workflow.**

1. On load, fetch status and the corpus doc list.
2. **Index status grid.** Total docs, pass / flag / unlabeled counts, indexed
   count, the embedding model badge (the provider that produced the stored
   vectors, neural or lexical fallback), and last-updated. Two actions: **Index /
   train** (embed any unindexed docs, or re-embed all if the provider changed)
   and **Run accuracy check** (the leave-one-out eval).
3. **Accuracy check (leave-one-out eval).** For each labeled pass/flag doc, hide
   it, find its nearest labeled neighbor, and check whether the neighbor shares
   its label. Report evaluated count, agreement count, accuracy, and a per-label
   breakdown. Frame it honestly: this measures retrieval as a grounding signal,
   not the correctness of the playbook's flag decision.
4. **Add to corpus.** Drop or choose files (or a folder); each staged doc gets an
   editable title and a label select (pass / flag / unlabeled). "Add to corpus"
   embeds and persists them.
5. **Corpus table.** Lists every doc (without the heavy vectors) with per-row
   relabel buttons (pass / flag / unlabeled), optimistic on click.
6. **Retrieval preview.** A query box; on submit, retrieve the top precedents and
   render them as cards with the label pill, a similarity score, a score bar, and
   the snippet.

**Honest framing requirement.** The copy must state that retrieval returns
**evidence**, and the deterministic playbook still owns each flag. The embedding
badge must say honestly whether the neural model or the lexical fallback produced
the vectors, so neural semantics are never implied when the fallback ran.

**Feature inventory.** Index status grid; index/train action; leave-one-out eval;
file/folder staging with editable title and label; add-to-corpus; corpus table
with per-row relabel; retrieval preview with score bars; provider badge.

**States.**

- *Pending index.* Provider badge reads "pending (index to embed)" until the
  first index runs.
- *Indexed (neural).* Badge shows the model name.
- *Indexed (lexical fallback).* Badge shows "lexical fallback (no model
  download)" - this is the offline embedding path when Hugging Face is blocked.
- *Eval run.* Shows accuracy and per-label breakdown.
- *Staging.* New docs queued with editable fields before commit.
- *Empty query.* Retrieval preview idle until a query is entered.

**AI vs deterministic boundary.** Retrieval and the eval are the engine; they
produce evidence and a credibility number. They never decide a contract's
pass/flag. ContractIQ's playbook does.

---

### 7.6 Impact - the business case (`/impact`)

**Purpose.** The one place dollars live. Quarantined off the working surfaces so
a working demo never reads as a sales pitch. Every number is tagged at its
confidence so the math is auditable rather than asserted.

**Reads / writes.** Static. All figures come from `lib/costModel.ts`. No API.

**Content blocks.**

1. **Presenter-mode toggle.** Collapses the detail to the three headline numbers
   for a room; the default view shows the full assumption ledger.
2. **Headline band.** Estimated annual labor recovered, with the ContractIQ and
   BudgetIQ split.
3. **Framing band.** These are labor-hours recovered, not headcount cuts; the win
   is throughput (the same team clears more and closes the quarter faster); the
   data unifies, the deployment stays modular.
4. **Module split cards.** ContractIQ savings and BudgetIQ savings, each with a
   sub-line of drivers.
5. **Detail sections (hidden in presenter mode).** For ContractIQ (attorney and
   paralegal hours, the cycle compression, docs per week per lawyer), BudgetIQ
   invoice (AP / approver / rework hours), and BudgetIQ planning (reforecast and
   accrual hours). Each detail section ends with an **assumption ledger** table.
6. **Assumption ledger.** Each row: the assumption, its value, a **source tag**
   (verified / assumption / estimate), and a note. This is the auditable core.
7. **Footnote.** States the figures are synthetic, modeled from discovery, not
   real Iovance financials; loaded labor rates are the only given inputs; hours
   count only when they convert to throughput; production stays modular.

**Source tags.** Every figure is one of: `verified` (from discovery calls),
`assumption` (a stated assumption), or `estimate` (a modeled estimate). The tag
is shown inline so grounded and modeled numbers are never confused.

**States.** Two: default (full ledger) and presenter (three headline numbers).
No loading or error paths.

**Constraint reminder.** Dollars appear here and nowhere else. The working
surfaces (ContractIQ, both BudgetIQ screens, Knowledge) speak in hours, queues,
findings, and throughput, never in dollars saved.

---

## 8. The golden demo path

One scripted path that exercises the whole spine and shows the AI lift and the
shared record. The rebuild should make this path frictionless.

1. **Dashboard.** Read the thesis and the lifecycle ribbon. One record, two
   modules, modular in production.
2. **ContractIQ.** Load the CryoLogix MSA sample (or upload a PDF). Turn on
   knowledge grounding. Run the review: see the extracted fields, the consistency
   checks, the flagged findings (for example Net 15 against the Net 60 standard),
   the suggested redlines, and the retrieved precedent evidence. Accept/dismiss a
   finding. **Commit to the shared record.**
3. **BudgetIQ - Invoice matching.** The committed CryoLogix record now tags the
   matching invoice rows. Watch the clean invoices auto-clear by rule and the
   messy vendor names (for example "BioReliance QC", "Veritas Cloud Infra") get
   resolved by live AI, while genuine exceptions (over-budget, no-PO) route to a
   human with an audit trail. Approve an exception.
4. **BudgetIQ - Financial planning.** The same committed payment schedule now
   drives the CryoLogix accrual (predictable, auto-accrue), while the usage-based
   vendor (Sentinel) is flagged for outreach. Read the reforecast variance.
5. **Knowledge.** Show the corpus, index/train, run the leave-one-out accuracy
   check ("tested against N past contracts, agreed X% of the time"), and run a
   retrieval query to show the evidence ContractIQ used.
6. **Impact.** Switch to presenter mode for the three headline numbers, then open
   the ledger to show every figure tagged verified / assumption / estimate.

The single thread through all six: one CryoLogix contract, read once, carried all
the way to its accrual.

---

## 9. Domain data and rules (for accurate UI copy and fixtures)

All synthetic. These are the actual fixtures the screens render, so the rebuilt
UI should reproduce them faithfully.

### 9.1 ContractIQ playbook (the standard each clause is judged against)

Five confirmed clause rules (stated by Ben in discovery): **net payment terms**
(standard Net 60; escalate Net 30 or shorter), **limitation of liability** (a cap
present, higher for PHI/PII vendors; escalate if uncapped or thin for sensitive
data), **IP ownership** (Iovance owns assets built for it; escalate if the vendor
retains them), **data processing addendum** (DPA required for sensitive-data
vendors; escalate if missing), and a general out-of-parameters catch.

Four unconfirmed defaults (retained but tagged not-Iovance-policy):
confidentiality, termination for convenience, auto-renewal, governing law.

Four amendment-layer rules (for change orders / renewals, from a real redline):
order of precedence, incorporation by reference, entire agreement, authority to
execute.

Three consistency checks (Ben-requested, rendered as their own strip): invoice
schedule arithmetic, key dates (including backdated effective dates), corporate
entity and address.

### 9.2 BudgetIQ matching thresholds

- `AUTO_CLEAR_CONFIDENCE = 0.85` - at or above this, the link auto-clears.
- `REVIEW_FLOOR_CONFIDENCE = 0.6` - between the floor and auto-clear, route to a
  human for a quick confirm; below the floor, do not trust the link.
- Deterministic confidences: exact PO cited = 0.99; sole normalized-vendor match
  = 0.9; no match = 0.2.
- Statuses: `matched`, `review`, `over_budget`, `no_po`.

### 9.3 Seed fixtures (shared vendor names make the lifecycle traceable)

- **Sample contracts.** CryoLogix Cold Chain Solutions MSA (24 months, Net 15
  flagged, $480,000, auto-renew, Delaware), Helix Analytics SaaS (36 months, Net
  60, $220,000, uncapped liability flagged, no DPA, England and Wales), Sentinel
  Managed Services change order (backdated a year, missing order-of-precedence).
- **Purchase orders.** Six, including a nearly exhausted Sentinel PO that trips
  the over-budget path.
- **Invoices.** Clean exact matches (auto-clear), a suffix-only mismatch that
  normalizes cleanly, messy vendor names only AI can resolve, a sparse name that
  resolves at medium confidence (review), and genuine exceptions (over budget,
  no PO).
- **Budget lines.** CryoLogix (monthly, predictable), Helix (quarterly,
  predictable), Sentinel (usage-based, needs outreach).
- **Knowledge seed precedents.** Eight, split pass (clean renewal, accepted
  big-corp terms, templated NDA) and flag (uncapped liability, vendor-owns-IP,
  missing DPA, Net 15, backdated change order). The labels double as eval ground
  truth.

---

## 10. API surface (the reconnection contract)

Five routes. These shapes are frozen for the design pass and are the anchor for
reconnection. All run on the Node runtime.

### 10.1 `POST /api/extract` (ContractIQ review)

Request: `{ contractText: string, useKnowledge?: boolean }`. Min 40 characters,
max 60,000.

Response: an `ExtractionResponse`, which is the `ContractExtraction` (Section 6)
plus a `_meta: ExtractionMeta` (Section 5). When `useKnowledge` is true, `_meta`
carries the `retrieval` block with the precedents used.

Engine behavior: live Claude (model `claude-sonnet-4-6`, temperature 0) when a
key is set and the response parses; otherwise an offline heuristic engine returns
the same shape with `engine: "offline-heuristic"` and a note.

### 10.2 `POST /api/triage` (BudgetIQ invoice matching)

Request: optional `{ invoices?: Invoice[], purchaseOrders?: PurchaseOrder[] }`.
Defaults to the bundled synthetic batch.

Response: `{ results: MatchResult[], meta: TriageMeta }`.

```ts
MatchResult {
  invoice: Invoice
  matchedPo: PurchaseOrder | null
  status: "matched" | "review" | "over_budget" | "no_po"
  confidence: number
  resolutionSource: "deterministic" | "ai" | "human"
  explanation: string
  suggestedResolution: string
  audit: AuditStep[]            // { label, source, detail, confidence? }
  needsHuman: boolean
}
```

Engine behavior: the deterministic core always runs and is both the offline
result and the source of the exception queue handed to the model. Live Claude
triages only the queue; the budget check and final status are always recomputed
deterministically. Offline when no key, parse failure, or API error.

### 10.3 `GET` / `POST` / `DELETE` `/api/records` (shared record store)

- `GET` -> `{ records: SharedRecord[] }`.
- `POST` `{ extraction, sourceName }` -> commits, upserts by normalized vendor,
  returns `{ record }`. Requires a vendor or a summary.
- `DELETE` -> clears the store.

### 10.4 `GET` / `POST` `/api/corpus` (Knowledge)

- `GET` -> `{ status: CorpusStatus, docs: CorpusDoc[] (without vectors) }`.
- `POST` `{ action, ...args }` where `action` is:
  - `index` -> embed unindexed docs (or re-embed all on provider change); returns
    status.
  - `add` `{ docs: NewDocInput[] }` -> add and embed; returns status.
  - `label` `{ id, label }` -> relabel a doc; returns status.
  - `retrieve` `{ query, k? }` -> `{ precedents: RetrievedPrecedent[] }`.
  - `evaluate` -> the leave-one-out `EvalResult`.

```ts
CorpusStatus {
  total, passCount, flagCount, unlabeledCount, indexed: number
  embeddingModel: string        // provider label, or "pending (index to embed)"
  lastUpdated: string | null
}
RetrievedPrecedent { id, title, vendor, label, clauseTag, note, score, snippet }
EvalResult { evaluated, correct, accuracy, perLabel[], note }
```

### 10.5 `POST /api/upload` (file ingestion, shared by ContractIQ and Knowledge)

Request: multipart form, field `files` (one or many; folder upload supported via
`webkitdirectory`).

Response: `{ files: UploadFileResult[] }`, each `{ fileName, ok, kind, chars,
truncated, note, text, error }`. Real server-side text extraction: PDF via
pdf-parse with a modern pdf.js fallback (unpdf) that recovers the malformed XRef
tables pdf-parse rejects (about half of a real invoice batch failed pdf-parse
alone), DOCX via mammoth, buffer decode for text. Max 60,000 characters.

### 10.6 `GET /api/envcheck` (temporary diagnostic - remove before ship)

Returns key presence booleans only, never the secret. This route must be deleted;
it exists only to diagnose a local env-shadowing issue and should not survive the
rebuild.

---

## 11. Engine and infrastructure notes (so the UI labels stay honest)

- **AI model.** `claude-sonnet-4-6`, temperature 0 for stable demo re-runs.
  Production target is AWS Bedrock in the Iovance VPC, which is also where the
  static system prompts would be prompt-cached.
- **Embeddings.** Local `Xenova/all-MiniLM-L6-v2` (384-dim) downloaded from
  Hugging Face on first use, with a deterministic **lexical fallback** (hashed
  bag-of-words, 384-dim, L2-normalized) when Hugging Face is blocked at the
  firewall (observed on enterprise networks). The corpus records which provider
  produced its vectors and re-embeds on a provider change so the whole store
  shares one vector space. Production target is Bedrock Knowledge Bases (Titan
  embeddings) in-VPC, the same interface shape.
- **Retrieval vs decision.** Retrieval is evidence only. The deterministic
  playbook owns the flag. The eval measures retrieval as a grounding signal.
- **Persistence.** The corpus persists to `data/corpus.json`; the record store is
  in-memory on `globalThis` (a demo convenience, not production architecture).

---

## 12. Product principles and hard constraints

These are non-negotiable and apply to the rebuild.

1. **No em-dash characters.** Anywhere, in copy or code. Use hyphens, commas,
   parentheses, or colons.
2. **Synthetic data only.** No real Iovance contracts, vendors, or financials.
   Every fixture in this repo is invented.
3. **Human in the loop on every consequential decision.** AI clears volume and
   drafts; a person disposes. The UI always offers the accept / dismiss / approve
   / override / reopen control on a consequential item.
4. **Deterministic, auditable money decisions.** The PO link and budget check are
   computed by rules with a traceable reason. A hallucinated PO is discarded.
   Every cleared invoice has an audit trail.
5. **Every dollar figure is tagged** verified / assumption / estimate, and
   dollars appear only on the Impact screen. Working surfaces speak in hours,
   queues, findings, and throughput.
6. **Provenance honesty.** The UI shows whether the live or offline engine ran,
   and whether embeddings are neural or the lexical fallback. Never imply neural
   semantics or a live model when the fallback or offline path ran.
7. **Two modules, cleanly separated, one shell.** Do not fuse ContractIQ and
   BudgetIQ logic. The only shared mutable state is the ContractExtraction record.
8. **Modular-in-production messaging.** Every present-back states that production
   stays modular against each team's system of record (legal DMS / Oro for
   ContractIQ, Points Purchasing / finance for BudgetIQ). The data unifies; the
   deployment stays modular. Never signal that ProcureIQ replaces those systems
   or forces legal and finance into one tool.

---

## 13. Design system reference (current tokens)

The rebuild may evolve the visual language, but here is the current token set so
continuity is a choice rather than an accident.

**Palette.** Navy `#1f3a5f`, deep navy `#16293f`, accent blue `#2e6da4`, accent
soft `#e7eefb`, green `#2e7d52`, amber `#b8860b`, red `#b23b3b`, background
`#f6f8fb`.

**Semantic color roles.** Green for ok / matched / pass / verified / live; amber
for review / assumption; red for flag / over-budget / no-po; navy and accent for
structure and chrome.

**Component vocabulary in use today.** Top bar with brand mark and tagline; nav
with active state; cards (default, tight, flat); stat blocks (number, label,
sub); status pills (ok, review, flag, matched, over_budget, no_po, pass,
unlabeled); source tags (deterministic, ai, human); provenance tags (verified,
assumption, estimate); engine badges (live, offline) with a status dot; finding
blocks (flag, review, ok) with a redline callout; audit trail with per-step
tags; module cards with icon and CTA; disclaimer and info bands; the lifecycle
ribbon; the upload dropzone and queue rows; precedent cards with a score bar; the
presenter bar with a big number and a toggle; key-value and footnote text;
tabular-aligned numeric table columns.

**Layout.** Responsive card grids (two, three, and four columns). A persistent
shell wrapper around the routed content.

---

## 14. Reconnection checklist (the second pass)

After the design pass, wire the new UI to the backend:

- [ ] ContractIQ review calls `POST /api/extract`, renders `_meta` badge and the
      `retrieval` panel when present, and posts to `/api/records` on commit.
- [ ] File and folder upload posts to `POST /api/upload` and loads the first
      extracted text.
- [ ] Invoice matching auto-runs `POST /api/triage` and `GET /api/records` on
      load, renders the audit trail and exception controls, supports re-run.
- [ ] Financial planning fetches `GET /api/records` and uses a committed payment
      schedule as the accrual basis where present.
- [ ] Knowledge wires the five corpus actions (index, add, label, retrieve,
      evaluate) and renders the provider badge honestly.
- [ ] Impact reads `lib/costModel.ts` only; no API; presenter toggle works.
- [ ] Every engine badge reflects the real meta block; offline paths render full
      results.
- [ ] `GET /api/envcheck` is deleted.
- [ ] No em-dash characters in any new file. Verify with a repo grep.
```
