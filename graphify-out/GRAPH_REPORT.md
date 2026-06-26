# Graph Report - /Users/jefferylin/Documents/Iovance/procureiq  (2026-06-25)

## Corpus Check
- 46 files · ~64,471 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 477 nodes · 882 edges · 21 communities (18 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 59,852 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `offlineExtraction()` - 22 edges
2. `compilerOptions` - 16 edges
3. `Invoice` - 11 edges
4. `POST()` - 10 edges
5. `readStore()` - 10 edges
6. `indexAll()` - 10 edges
7. `ContractExtraction record` - 10 edges
8. `useEngine()` - 9 edges
9. `retrieve()` - 9 edges
10. `normalizeExtraction()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `buildGrounding()` --calls--> `getStatus()`  [EXTRACTED]
  app/api/extract/route.ts → lib/corpus.ts
- `buildGrounding()` --calls--> `retrieve()`  [EXTRACTED]
  app/api/extract/route.ts → lib/corpus.ts
- `POST()` --calls--> `extractJsonObject()`  [EXTRACTED]
  app/api/ingest/route.ts → lib/normalizeExtraction.ts
- `GET()` --calls--> `listRecords()`  [EXTRACTED]
  app/api/records/route.ts → lib/recordStore.ts
- `POST()` --calls--> `extractText()`  [EXTRACTED]
  app/api/upload/route.ts → lib/extractText.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Six routes / four working surfaces** — procureiq_product_spec_dashboard, procureiq_product_spec_contract_review_screen, procureiq_product_spec_invoice_matching, procureiq_product_spec_financial_planning, procureiq_product_spec_knowledge_screen, procureiq_product_spec_impact_screen [EXTRACTED 1.00]
- **Playbook clause rules and checks** — procureiq_product_spec_net_payment_terms, procureiq_product_spec_limitation_of_liability, procureiq_product_spec_ip_ownership, procureiq_product_spec_data_processing_addendum, procureiq_product_spec_consistency_checks [EXTRACTED 1.00]
- **Lifecycle throughline spine** — procureiq_product_spec_contractiq, procureiq_product_spec_invoice_matching, procureiq_product_spec_financial_planning, procureiq_product_spec_contractextraction_record [EXTRACTED 1.00]
- **Three-way provenance trust spine** — procureiq_product_spec_deterministic_core, procureiq_product_spec_provenance_tags, procureiq_product_spec_human_in_the_loop, procureiq_product_spec_live_offline_fallback [INFERRED 0.85]
- **Knowledge RAG grounding engine** — procureiq_product_spec_knowledge_corpus, procureiq_product_spec_embeddings, procureiq_product_spec_retrieval, procureiq_product_spec_leave_one_out_eval [EXTRACTED 1.00]

## Communities (21 total, 3 thin omitted)

### Community 0 - "ContractIQ Extract API & Normalization"
Cohesion: 0.07
Nodes (52): buildGrounding(), meta(), POST(), asBool(), asInstrumentType(), asNumber(), asSeverity(), asString() (+44 more)

### Community 1 - "Invoice-PO Matching Engine"
Cohesion: 0.08
Nodes (44): finalizeMatch(), fmt(), matchAllDeterministic(), normalizeVendor(), Resolution, resolveDeterministic(), SUFFIX_TOKENS, BUDGET_LINES (+36 more)

### Community 2 - "Knowledge Corpus API"
Cohesion: 0.10
Nodes (43): GET(), POST(), VALID_LABELS, PendingDoc, addDocs(), classifyDocs(), ClassifySuggestion, CLAUSE_KEYWORDS (+35 more)

### Community 3 - "Product Concepts & Architecture"
Cohesion: 0.08
Nodes (36): BudgetIQ module, Consistency checks, ContractIQ contract review screen, ContractExtraction record, ContractIQ module, Cost model (lib/costModel.ts), Dashboard screen, Data processing addendum clause rule (+28 more)

### Community 4 - "Ingest & Offline Budget/Invoice"
Cohesion: 0.10
Nodes (29): DELETE(), IngestKind, meta(), normalizeBudget(), normalizeInvoice(), normPo(), num(), offlineInvoice() (+21 more)

### Community 5 - "Dashboard UI"
Cohesion: 0.06
Nodes (22): metadata, card, EXCEPTIONS, LIFECYCLE, MATCH_RESULTS, Metric, MetricKey, METRICS (+14 more)

### Community 6 - "Invoice Matching UI"
Cohesion: 0.09
Nodes (16): HumanAction, SharedRecordLite, STATUS_STYLE, UploadedInvoice, UploadNote, crc32(), csvBlob(), ExportFormat (+8 more)

### Community 7 - "Package Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, @anthropic-ai/sdk, docx, mammoth, next, pdf-parse, react, react-dom (+16 more)

### Community 8 - "Impact / Cost Model UI"
Cohesion: 0.15
Nodes (17): ImpactPage(), SOURCE_STYLE, totals, Assumption, contractAssumptions, ContractResult, contractReview(), financeAssumptions (+9 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Contract Family Linking"
Cohesion: 0.17
Nodes (17): buildFamilies(), childAsserts(), ContractFamily, isBase(), LINK_CONFIDENCE_LABEL, LINK_STATUS_LABEL, LinkingResult, mergeFamilyFindings() (+9 more)

### Community 11 - "Financial Planning UI & Upload"
Cohesion: 0.17
Nodes (11): UploadProgress(), MONTHS, projectedYear(), SharedRecordLite, UploadedActual, UploadNote, ytd(), BudgetIngestResponse (+3 more)

### Community 12 - "Shared Record Store"
Cohesion: 0.26
Nodes (14): LinkableDoc, clearRecords(), getRecordByVendor(), listRecords(), normalizeVendor(), saveRecord(), SharedRecord, store() (+6 more)

### Community 13 - "Contract Review UI"
Cohesion: 0.14
Nodes (12): BatchRow, card, CONSISTENCY_KEYS, Disposition, fieldLabel, HANDOFF, SAMPLES, SEVERITY_RANK (+4 more)

### Community 14 - "Knowledge UI"
Cohesion: 0.15
Nodes (10): ClassifySuggestion, CLAUSE_DETAIL, clauseDetail(), DocRow, EvalResult, prettyTag(), Triage, TRIAGE_BADGE (+2 more)

### Community 15 - "Text Extraction (PDF/DOCX)"
Cohesion: 0.27
Nodes (10): clamp(), extractDocx(), ExtractedDoc, extractPdf(), extractPdfRobust(), extractText(), kindFor(), SupportedKind (+2 more)

### Community 16 - "App Shell & Navigation"
Cohesion: 0.20
Nodes (9): useEngine(), NAV, NavGroup, NavItem, NavLeaf, Shell(), ContractReviewPage(), FinancialPlanningPage() (+1 more)

### Community 17 - "Root Layout & Engine Context"
Cohesion: 0.29
Nodes (5): metadata, Ctx, EngineCtx, EngineMode, EngineProvider()

## Knowledge Gaps
- **141 isolated node(s):** `VALID_LABELS`, `IngestKind`, `UploadFileResult`, `QueueItem`, `REVIEW_QUEUE` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useEngine()` connect `App Shell & Navigation` to `Root Layout & Engine Context`, `Financial Planning UI & Upload`, `Contract Review UI`, `Invoice Matching UI`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `ContractExtraction` connect `Shared Record Store` to `ContractIQ Extract API & Normalization`, `Invoice-PO Matching Engine`, `Contract Family Linking`, `Contract Review UI`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Invoice` connect `Invoice-PO Matching Engine` to `Ingest & Offline Budget/Invoice`, `Invoice Matching UI`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `VALID_LABELS`, `IngestKind`, `UploadFileResult` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ContractIQ Extract API & Normalization` be split into smaller, more focused modules?**
  _Cohesion score 0.07077922077922078 - nodes in this community are weakly interconnected._
- **Should `Invoice-PO Matching Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.08106219426974144 - nodes in this community are weakly interconnected._
- **Should `Knowledge Corpus API` be split into smaller, more focused modules?**
  _Cohesion score 0.0963265306122449 - nodes in this community are weakly interconnected._