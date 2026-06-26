# Graph Report - procureiq  (2026-06-26)

## Corpus Check
- 81 files · ~184,862 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 954 nodes · 1708 edges · 58 communities (54 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `485788c7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_ContractIQ Extract API & Normalization|ContractIQ Extract API & Normalization]]
- [[_COMMUNITY_Invoice-PO Matching Engine|Invoice-PO Matching Engine]]
- [[_COMMUNITY_Knowledge Corpus API|Knowledge Corpus API]]
- [[_COMMUNITY_Product Concepts & Architecture|Product Concepts & Architecture]]
- [[_COMMUNITY_Ingest & Offline BudgetInvoice|Ingest & Offline Budget/Invoice]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_Invoice Matching UI|Invoice Matching UI]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Impact  Cost Model UI|Impact / Cost Model UI]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Contract Family Linking|Contract Family Linking]]
- [[_COMMUNITY_Financial Planning UI & Upload|Financial Planning UI & Upload]]
- [[_COMMUNITY_Shared Record Store|Shared Record Store]]
- [[_COMMUNITY_Contract Review UI|Contract Review UI]]
- [[_COMMUNITY_Knowledge UI|Knowledge UI]]
- [[_COMMUNITY_Text Extraction (PDFDOCX)|Text Extraction (PDF/DOCX)]]
- [[_COMMUNITY_App Shell & Navigation|App Shell & Navigation]]
- [[_COMMUNITY_Root Layout & Engine Context|Root Layout & Engine Context]]
- [[_COMMUNITY_NavBar Component|NavBar Component]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_pdf-parse Type Shim|pdf-parse Type Shim]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]

## God Nodes (most connected - your core abstractions)
1. `offlineExtraction()` - 22 edges
2. `ProcureIQ Q&A Preparation` - 17 edges
3. `compilerOptions` - 16 edges
4. `ProcureIQ Product and UI Specification` - 16 edges
5. `ProcureIQ Presentation Script` - 16 edges
6. `ContractExtraction` - 14 edges
7. `POST()` - 13 edges
8. `POST()` - 13 edges
9. `useReviewer()` - 13 edges
10. `Invoice` - 13 edges

## Surprising Connections (you probably didn't know these)
- `coerceThresholds()` --calls--> `num()`  [INFERRED]
  lib/clauseThresholds.ts → app/api/ingest/route.ts
- `GET()` --calls--> `listBudgetActuals()`  [EXTRACTED]
  app/api/budget-actuals/route.ts → lib/budgetActualsStore.ts
- `GET()` --calls--> `getLiveBudget()`  [EXTRACTED]
  app/api/budget/route.ts → lib/budgetStore.ts
- `buildGrounding()` --calls--> `getStatus()`  [EXTRACTED]
  app/api/extract/route.ts → lib/corpus.ts
- `buildGrounding()` --calls--> `retrieve()`  [EXTRACTED]
  app/api/extract/route.ts → lib/corpus.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Six routes / four working surfaces** — procureiq_product_spec_dashboard, procureiq_product_spec_contract_review_screen, procureiq_product_spec_invoice_matching, procureiq_product_spec_financial_planning, procureiq_product_spec_knowledge_screen, procureiq_product_spec_impact_screen [EXTRACTED 1.00]
- **Playbook clause rules and checks** — procureiq_product_spec_net_payment_terms, procureiq_product_spec_limitation_of_liability, procureiq_product_spec_ip_ownership, procureiq_product_spec_data_processing_addendum, procureiq_product_spec_consistency_checks [EXTRACTED 1.00]
- **Lifecycle throughline spine** — procureiq_product_spec_contractiq, procureiq_product_spec_invoice_matching, procureiq_product_spec_financial_planning, procureiq_product_spec_contractextraction_record [EXTRACTED 1.00]
- **Three-way provenance trust spine** — procureiq_product_spec_deterministic_core, procureiq_product_spec_provenance_tags, procureiq_product_spec_human_in_the_loop, procureiq_product_spec_live_offline_fallback [INFERRED 0.85]
- **Knowledge RAG grounding engine** — procureiq_product_spec_knowledge_corpus, procureiq_product_spec_embeddings, procureiq_product_spec_retrieval, procureiq_product_spec_leave_one_out_eval [EXTRACTED 1.00]

## Communities (58 total, 4 thin omitted)

### Community 0 - "ContractIQ Extract API & Normalization"
Cohesion: 0.05
Nodes (70): buildGrounding(), deterministicConfidence(), meta(), POST(), termValue(), LinkableDoc, CACHE_PATH, CacheEntry (+62 more)

### Community 1 - "Invoice-PO Matching Engine"
Cohesion: 0.17
Nodes (16): buildLiveResults(), DETAIL_BY_PO, isPoDataset(), loadPurchaseOrders(), loadPurchaseOrdersWithOverrides(), PoDataset, REGISTER_POS, RegisterDetail (+8 more)

### Community 2 - "Knowledge Corpus API"
Cohesion: 0.11
Nodes (21): PendingDoc, ClassifySuggestion, CLAUSE_KEYWORDS, CLAUSE_LABEL, clauseExcerptOf(), clauseLabel(), CorpusDocRow, DATA_DIR (+13 more)

### Community 3 - "Product Concepts & Architecture"
Cohesion: 0.08
Nodes (36): BudgetIQ module, Consistency checks, ContractIQ contract review screen, ContractExtraction record, ContractIQ module, Cost model (lib/costModel.ts), Dashboard screen, Data processing addendum clause rule (+28 more)

### Community 4 - "Ingest & Offline Budget/Invoice"
Cohesion: 0.12
Nodes (30): DELETE(), baseInvoiceNumber(), checkDuplicate(), DuplicateCheck, DuplicateKind, DuplicateMatch, isCreditNumber(), isRevisionNumber() (+22 more)

### Community 5 - "Dashboard UI"
Cohesion: 0.07
Nodes (18): ActualLite, BASELINE, Bucket, BuildInput, card, cardLabel, cardSub, Cell (+10 more)

### Community 6 - "Invoice Matching UI"
Cohesion: 0.11
Nodes (14): ManualResolution, RecordClearanceLite, SharedRecordLite, STATUS_STYLE, UploadedInvoice, UploadNote, BUDGET_LINES, INVOICES (+6 more)

### Community 7 - "Package Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, @anthropic-ai/sdk, docx, mammoth, next, pdf-parse, react, react-dom (+18 more)

### Community 8 - "Impact / Cost Model UI"
Cohesion: 0.22
Nodes (12): contractAssumptions, ContractResult, contractReview(), financeAssumptions, FinanceResult, financialPlanning(), invoiceAssumptions, invoiceMatching() (+4 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Contract Family Linking"
Cohesion: 0.15
Nodes (18): LedgerEntry, finalizeMatch(), fmt(), matchAllDeterministic(), normalizeVendor(), Resolution, resolveDeterministic(), SUFFIX_TOKENS (+10 more)

### Community 11 - "Financial Planning UI & Upload"
Cohesion: 0.13
Nodes (13): AccrualKind, mergeUnmatched(), MONTHS, normVendor(), projectedYear(), SharedRecordLite, UnmatchedActual, UploadedActual (+5 more)

### Community 12 - "Shared Record Store"
Cohesion: 0.17
Nodes (21): chain, ClearanceStatus, clearRecords(), DATA_DIR, deleteRecord(), ensureDir(), getRecordByVendor(), listRecords() (+13 more)

### Community 13 - "Contract Review UI"
Cohesion: 0.12
Nodes (16): UploadProgress(), BatchRow, card, CONSISTENCY_KEYS, Disposition, fieldLabel, HANDOFF, SAMPLES (+8 more)

### Community 14 - "Knowledge UI"
Cohesion: 0.10
Nodes (23): ClassifySuggestion, CLAUSE_DETAIL, clauseDetail(), DocRow, EvalResult, prettyTag(), Triage, TRIAGE_BADGE (+15 more)

### Community 15 - "Text Extraction (PDF/DOCX)"
Cohesion: 0.26
Nodes (11): clamp(), extractDocx(), ExtractedDoc, extractPdf(), extractPdfRobust(), extractText(), extractXlsx(), kindFor() (+3 more)

### Community 16 - "App Shell & Navigation"
Cohesion: 0.22
Nodes (11): useEngine(), useReviewer(), NAV, NavGroup, NavItem, NavLeaf, Shell(), ContractReviewPage() (+3 more)

### Community 17 - "Root Layout & Engine Context"
Cohesion: 0.06
Nodes (56): DELETE(), GET(), PATCH(), PUT(), toLine(), buildBudgetLine(), handleBudgetPlan(), IngestKind (+48 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (32): 0. How to use this document, 10.1 `POST /api/extract` (ContractIQ review), 10.2 `POST /api/triage` (BudgetIQ invoice matching), 10.3 `GET` / `POST` / `DELETE` `/api/records` (shared record store), 10.4 `GET` / `POST` `/api/corpus` (Knowledge), 10.5 `POST /api/upload` (file ingestion, shared by ContractIQ and Knowledge), 10.6 `GET /api/envcheck` (temporary diagnostic - remove before ship), 10. API surface (the reconnection contract) (+24 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (25): AddedPo, addPo(), chain, DATA_DIR, deleteAddedPo(), EDITABLE, ensureDir(), listAddedPos() (+17 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (22): If someone asks "can we export this to Excel?", If someone asks "how do we know the AI is not making up the redline?", If someone asks "what happens when a vendor changes their name?", If the live demo fails or slows down, If you run long on time, If you run short on time, Key phrases to repeat (memory anchors), LIVE DEMO: Audit Trail (6:15 - 6:45) (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (19): ACTIONS, DELETE(), GET(), MODULES, POST(), toInput(), appendAuditEvent(), AuditEventInput (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (15): ACTION_LABELS, MODULE_STYLE, auditToSheet(), formatAuditTime(), LogAuditInput, crc32(), csvBlob(), ExportFormat (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (16): DELETE(), GET(), PUT(), chain, clearBudgetActuals(), DATA_DIR, deleteBudgetActual(), ensureDir() (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (15): DELETE(), GET(), PUT(), chain, clearDecisions(), DATA_DIR, ensureDir(), listDecisions() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (16): 1. What the deck does well (keep these), 2. What the deck misses (add or emphasize), 3. Timing and flow recommendations, 4. Visual recommendations, 5. One-liner summary, A. Missing: The "Special Features" slide (suggest inserting between Slide 4 and 5), B. Slide 4: "Live Demo - One App Shell" is overloaded, C. Slide 5: "Clear the clean majority" is too number-dense without visual anchors (+8 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (9): comp(), FIXED_TIERS, ImpactPage(), leversFor(), SOURCE_STYLE, SPEND_OPTIONS, THROUGHPUT, Assumption (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (7): logAudit(), BLANK_DRAFT, FormState, money(), PoFormDraft, PoRegisterPage(), RegisterViewRow

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (7): 11. Knowledge Module & RAG, ProcureIQ Q&A Preparation, Q: Can we add our own precedents?, Q: How accurate is the retrieval?, Q: What embedding model is used?, Q: What is the Knowledge module for?, Table of Contents

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (8): 12. Edge Cases & Failure Modes, Q: What happens if the server crashes mid-review?, Q: What if a vendor changes its name after the contract is signed?, Q: What if an invoice has no PO number and no recognizable vendor name?, Q: What if the contract is in a non-standard format (scanned image, handwritten)?, Q: What if the LLM hallucinates a clause that is not in the contract?, Q: What if the PO is over budget, but the invoice is correct?, Q: What if two invoices from the same vendor hit the same PO, and the combined total exceeds the remaining budget?

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (7): 1. Build & Architecture, Q: How big is the codebase?, Q: How do you test it?, Q: Is it open source? Can we see the code?, Q: What stack did you build this on?, Q: Who built it?, Q: Why not buy a vendor platform?

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (7): 2. The Deterministic Model, Q: Can the thresholds be changed?, Q: How do you prevent a bug in the deterministic code from paying the wrong invoice?, Q: What are the exact thresholds?, Q: What happens if the deterministic rule and the AI disagree?, Q: What is the playbook, and who owns it?, Q: Why is the money decision deterministic instead of AI-driven?

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (7): 9. ROI, Cost Model & Assumptions, Q: Can we see the detailed assumptions?, Q: Is the attorney backfill number realistic?, Q: What about the working capital release?, Q: What if the volume assumptions are wrong?, Q: What is the payback period?, Q: Where do these numbers come from?

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (6): 10. AI, LLM & Offline Fallback, Q: Can the offline engine handle complex contracts?, Q: What does the AI actually do?, Q: What is the latency?, Q: What is the offline fallback, and when does it trigger?, Q: Which model are you using?

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (6): 14. Roadmap & Next Steps, Q: What are the biggest risks?, Q: What do you need from us today?, Q: What is the long-term vision?, Q: What is the next 90 days?, Q: What is the production cost estimate?

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (6): 3. Contract Families & Linking, Q: Can this handle nested families (MSA -> SOW -> Change Order)?, Q: How does the system merge a parent and child into a single evaluation?, Q: What if the amendment does not cite a Contract No.?, Q: What if the parent agreement is not uploaded yet?, Q: Why do we need contract-family linking? Can't we just match by vendor name?

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (6): 4. Duplicate Detection (Dedup), Q: Does dedup use AI?, Q: How does dedup work, and when does it run?, Q: What about invoice numbers with file-copy suffixes like "_8"?, Q: What are the four kinds of collisions?, Q: Why not flag "same vendor + same amount, different number" as a duplicate?

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (6): 5. Audit Trail & Compliance, Q: Can the audit trail be edited or deleted?, Q: Can we export it?, Q: How does the audit trail help with SOX or external audit?, Q: How long is the audit trail retained?, Q: What exactly is logged in the audit trail?

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (6): 7. Data, Security & Privacy, Q: Is any real Iovance data in the demo?, Q: Is there an em-dash anywhere in the code or copy?, Q: What about the LLM? Is our contract data going to Anthropic?, Q: Where does the contract text go when uploaded?, Q: Who has access to the system?

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (6): Emergency Responses, If asked a question you cannot answer, If asked "can we see the code?", If asked "why should we believe this works?", If challenged aggressively on ROI, If challenged on AI safety

### Community 43 - "Community 43"
Cohesion: 0.40
Nodes (5): 13. Competitive & Strategic, Q: How does this compare to a CLM (Contract Lifecycle Management) platform?, Q: How does this compare to an AP automation tool?, Q: What is the moat?, Q: Why not just use ChatGPT for contract review?

### Community 44 - "Community 44"
Cohesion: 0.40
Nodes (5): 6. Workflow & Usage, Q: Can we upload a folder of contracts?, Q: Walk me through the day in the life of each persona., Q: What file formats can be uploaded?, Q: What is the "golden demo path"?

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (5): 8. Integration & Production Architecture, Q: Can we run this without internet access?, Q: How does this integrate with our existing systems?, Q: What is the deployment model?, Q: What is the production target for AI and embeddings?

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (6): extraArgs, fs, localNext, net, path, { spawn }

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (4): buildModel(), pct(), signedUsd(), usdCompact()

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (3): args, child, { spawn }

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (18): buildFamilies(), childAsserts(), ContractFamily, isBase(), LINK_CONFIDENCE_LABEL, LINK_STATUS_LABEL, LinkingResult, mergeFamilyExtraction() (+10 more)

### Community 51 - "Community 51"
Cohesion: 0.09
Nodes (22): 0 · Pre‑flight (do this 5 minutes before you walk in), 1 · Timing map, ACT I — THE SETUP  (slides 1–3, ~4 min), ACT II — THE LIVE DEMO  (slide 4 → the app, ~11 min), ACT III — WHAT IT'S WORTH  (slides 5–7, ~6 min), ACT IV — ENGINEERING FOR TRUST + BOTTOM LINE  (slides 8–9, ~4 min), APPENDIX — "Every system was deliberate" (your depth list), Beat 0 — Enter the demo *(and turn the login into a selling point)* (+14 more)

### Community 52 - "Community 52"
Cohesion: 0.27
Nodes (18): GET(), POST(), VALID_LABELS, addDocs(), classifyDocs(), countByLabel(), evaluate(), getStatus() (+10 more)

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (11): ClauseThresholds, coerceThresholds(), relabelByThresholds(), chain, DATA_DIR, readThresholds(), STORE_PATH, withLock() (+3 more)

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (8): metadata, Ctx, EngineCtx, EngineMode, EngineProvider(), Ctx, ReviewerCtx, ReviewerProvider()

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (9): cosine(), embeddingInfo, embedText(), FeatureExtractor, getExtractor(), hashToken(), lexicalEmbed(), resolveProvider() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.16
Nodes (15): chain, clearTriageResult(), DATA_DIR, EMPTY, ensureDir(), getTriageResult(), readStore(), saveTriageResult() (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.43
Nodes (7): AiResolution, asConfidence(), asPoNumber(), asString(), extractJsonObject(), parseAiResolutions(), repairTruncatedJson()

## Knowledge Gaps
- **359 isolated node(s):** `MODULES`, `ACTIONS`, `VALID_LABELS`, `IngestKind`, `UploadFileResult` (+354 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ProcureIQ Q&A Preparation` connect `Community 31` to `Community 32`, `Community 33`, `Community 34`, `Community 35`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `ContractExtraction` connect `ContractIQ Extract API & Normalization` to `Community 50`, `Contract Family Linking`, `Shared Record Store`, `Contract Review UI`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `useReviewer()` connect `App Shell & Navigation` to `Invoice Matching UI`, `Financial Planning UI & Upload`, `Contract Review UI`, `Knowledge UI`, `Community 54`, `Community 30`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `MODULES`, `ACTIONS`, `VALID_LABELS` to the rest of the system?**
  _361 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ContractIQ Extract API & Normalization` be split into smaller, more focused modules?**
  _Cohesion score 0.05157894736842105 - nodes in this community are weakly interconnected._
- **Should `Knowledge Corpus API` be split into smaller, more focused modules?**
  _Cohesion score 0.1076923076923077 - nodes in this community are weakly interconnected._
- **Should `Product Concepts & Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.08253968253968254 - nodes in this community are weakly interconnected._