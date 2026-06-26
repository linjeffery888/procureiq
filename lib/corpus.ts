// The precedent corpus: a persisted vector store with cosine kNN retrieval and
// a leave-one-out eval. This is the engine behind the Knowledge module.
//
// Design split (the auditable boundary, stated in the architecture doc): this
// store only RETRIEVES precedent as evidence and reports how often retrieval
// agrees with the attorney's past disposition. It never owns the pass/flag
// decision for a contract under review; the deterministic playbook does. So the
// eval here measures "how good is retrieval as a grounding signal," not "is the
// flag correct."
//
// Persistence is a JSON file under data/. Embeddings are computed once at ingest
// and stored alongside each doc so retrieval does not re-embed the corpus on
// every query. The embedding provider (neural all-MiniLM when huggingface.co is
// reachable, otherwise the deterministic lexical fallback) is recorded on the
// store so the whole corpus always shares one vector space; if the provider
// changes between runs, the corpus is re-embedded before retrieval. In
// production this is a Bedrock Knowledge Base in-VPC; the file store is the
// prototype stand-in.

import fs from "fs/promises";
import path from "path";
import {
  CorpusDoc,
  CorpusLabel,
  CorpusStatus,
  RetrievedPrecedent,
} from "./types";
import { SEED_PRECEDENTS } from "./mockData";
import { ClauseThresholds, classifyClauseByThreshold } from "./clauseThresholds";
import {
  embedText,
  embedMany,
  lexicalEmbed,
  cosine,
  embeddingInfo,
  labelFor,
  EmbeddingProvider,
} from "./embeddings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "corpus.json");

interface StoreFile {
  docs: CorpusDoc[];
  lastUpdated: string | null;
  provider?: EmbeddingProvider | null; // which embedder produced the stored vectors
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Read the store from disk. On first run (no file yet) seed it with the
// synthetic precedents, unindexed; indexing happens on demand.
async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed.docs) return { docs: [], lastUpdated: null, provider: null };
    return parsed;
  } catch {
    const seeded: StoreFile = {
      docs: SEED_PRECEDENTS.map((d) => ({ ...d })),
      lastUpdated: null,
      provider: null,
    };
    await writeStore(seeded);
    return seeded;
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function countByLabel(docs: CorpusDoc[], label: CorpusLabel): number {
  return docs.filter((d) => d.label === label).length;
}

function hasEmbedding(d: CorpusDoc): boolean {
  return Array.isArray(d.embedding) && d.embedding.length > 0;
}

function statusFrom(store: StoreFile): CorpusStatus {
  const docs = store.docs;
  return {
    total: docs.length,
    passCount: countByLabel(docs, "pass"),
    flagCount: countByLabel(docs, "flag"),
    unlabeledCount: countByLabel(docs, "unlabeled"),
    indexed: docs.filter(hasEmbedding).length,
    embeddingModel: store.provider ? labelFor(store.provider) : "pending (index to embed)",
    lastUpdated: store.lastUpdated,
  };
}

// Current status without forcing a model load. Reports the provider recorded on
// the store, so the UI shows "neural" vs "lexical fallback" honestly without
// paying a network probe on every page load.
export async function getStatus(): Promise<CorpusStatus> {
  const store = await readStore();
  return statusFrom(store);
}

// True if anything must be re-embedded: a doc is missing its vector, or the
// active provider differs from the one the corpus was embedded with.
function needsReindex(store: StoreFile, provider: EmbeddingProvider): boolean {
  if (store.provider != null && store.provider !== provider) return true;
  return store.docs.some((d) => !hasEmbedding(d));
}

// Compute embeddings for any doc that needs one (or all docs, if the provider
// changed), persist, and return status. This is the "index" / "train" action.
export async function indexAll(): Promise<CorpusStatus> {
  const store = await readStore();
  const { provider } = await embeddingInfo();
  const providerChanged = store.provider != null && store.provider !== provider;
  const targets = providerChanged ? store.docs : store.docs.filter((d) => !hasEmbedding(d));
  if (targets.length > 0) {
    const vectors = await embedMany(targets.map(docEmbedText));
    targets.forEach((d, i) => { d.embedding = vectors[i]; });
    store.provider = provider;
    store.lastUpdated = new Date().toISOString();
    await writeStore(store);
  } else if (store.provider == null) {
    store.provider = provider;
    await writeStore(store);
  }
  return statusFrom(store);
}

export interface NewDocInput {
  title: string;
  text: string;
  vendor?: string | null;
  docType?: string | null;
  label?: CorpusLabel;
  clauseTag?: string | null;
  note?: string;
}

// Add documents to the corpus, embed them immediately, and persist. If the
// existing corpus was embedded with a different provider, re-embed it too so the
// whole store stays in one vector space. Returns the updated status.
export async function addDocs(inputs: NewDocInput[]): Promise<CorpusStatus> {
  const store = await readStore();
  const { provider } = await embeddingInfo();
  const now = new Date().toISOString();
  const prepared: CorpusDoc[] = inputs.map((inp, i) => ({
    id: `doc-${Date.now()}-${i}`,
    title: inp.title,
    vendor: inp.vendor ?? null,
    docType: inp.docType ?? null,
    label: inp.label ?? "unlabeled",
    clauseTag: inp.clauseTag ?? null,
    text: inp.text,
    note: inp.note ?? "",
    addedAt: now,
  }));
  const providerChanged = store.provider != null && store.provider !== provider;
  const toEmbed = providerChanged ? [...store.docs, ...prepared] : prepared;
  const vectors = await embedMany(toEmbed.map(docEmbedText));
  toEmbed.forEach((d, i) => { d.embedding = vectors[i]; });
  store.docs.push(...prepared);
  store.provider = provider;
  store.lastUpdated = now;
  await writeStore(store);
  return statusFrom(store);
}

// Re-label a doc (the attorney correcting a disposition). Clears nothing else.
export async function labelDoc(id: string, label: CorpusLabel): Promise<CorpusStatus> {
  const store = await readStore();
  const doc = store.docs.find((d) => d.id === id);
  if (doc) {
    doc.label = label;
    store.lastUpdated = new Date().toISOString();
    await writeStore(store);
  }
  return statusFrom(store);
}

// Re-label the whole corpus against a set of clause thresholds. For each
// precedent whose clause carries a numeric threshold (net terms, liability cap,
// confidentiality survival, auto-renewal notice), re-derive pass/flag from the
// precedent's own text under the new thresholds; precedents whose clause has no
// numeric threshold, or whose text states no parseable value, keep their existing
// label. This is the downstream effect of editing a threshold: raising or
// lowering a number re-colors which on-file precedents read as pass vs flag,
// without re-embedding anything. Returns the new status plus how many flipped.
export async function relabelByThresholds(
  thresholds: ClauseThresholds,
): Promise<{ status: CorpusStatus; changed: number }> {
  const store = await readStore();
  let changed = 0;
  for (const doc of store.docs) {
    const next = classifyClauseByThreshold(doc.clauseTag, doc.text, thresholds);
    if (next != null && next !== doc.label) {
      doc.label = next;
      changed++;
    }
  }
  if (changed > 0) store.lastUpdated = new Date().toISOString();
  await writeStore(store);
  return { status: statusFrom(store), changed };
}

// One corpus doc for the UI: the stored fields minus the heavy embedding vector,
// plus the single verbatim clause line from this doc's own text that its clause
// tag points at. The reviewer sees the exact threshold-bearing sentence that made
// this precedent a pass or a flag, without the client re-deriving it.
export type CorpusDocRow = Omit<CorpusDoc, "embedding"> & { clauseExcerpt: string };

// List the corpus without the heavy embedding vectors, for the UI table.
export async function listDocs(): Promise<CorpusDocRow[]> {
  const store = await readStore();
  return store.docs.map(({ embedding, ...rest }) => ({
    ...rest,
    clauseExcerpt: clauseExcerptOf(rest.text, rest.clauseTag),
  }));
}

function toPrecedent(doc: CorpusDoc, score: number): RetrievedPrecedent {
  return {
    id: doc.id,
    title: doc.title,
    vendor: doc.vendor,
    label: doc.label,
    clauseTag: doc.clauseTag,
    note: doc.note,
    score,
    snippet: doc.text.slice(0, 240),
  };
}

// Human-readable clause names, prepended to each doc's embedding input so a
// conceptual query ("uncapped liability") aligns with the clause topic instead of
// just the surrounding boilerplate. Embedding-only; the UI keeps its own copy.
const CLAUSE_LABEL: Record<string, string> = {
  net_payment_terms: "Net payment terms",
  limitation_of_liability: "Limitation of liability",
  confidentiality: "Confidentiality and non-disclosure",
  ip_ownership: "Intellectual property ownership and work product",
  data_privacy: "Data privacy and protection, DPA",
  key_dates: "Key dates and effective date",
  governing_law: "Governing law",
  corporate_address: "Corporate entity and address",
  auto_renewal: "Auto-renewal",
  invoice_schedule_math: "Invoice and payment schedule",
  order_of_precedence: "Order of precedence",
};

function clauseLabel(tag: string | null): string {
  if (!tag) return "";
  return CLAUSE_LABEL[tag] ?? tag.replace(/_/g, " ");
}

// The text we actually embed for a precedent. Beyond the raw clause text we
// prepend the clause topic and fold in the attorney's disposition note, because
// reviewers query in concepts and outcomes ("vendor owns the work product",
// "uncapped liability") that match the note and clause name far better than the
// legal boilerplate alone.
function docEmbedText(d: {
  title: string;
  text: string;
  note?: string;
  clauseTag?: string | null;
}): string {
  return [clauseLabel(d.clauseTag ?? null), d.title, d.note, d.text]
    .filter((s) => s && String(s).trim())
    .join(". ");
}

// Which clause tags a free-text query is "about", by keyword hits. Used to bias
// retrieval toward the relevant clause families so an IP/liability query does not
// surface key-dates precedents that merely share generic contract wording.
function inferQueryClauses(query: string): Set<string> {
  const low = ` ${query.toLowerCase()} `;
  const hits = new Set<string>();
  for (const tag of Object.keys(CLAUSE_KEYWORDS)) {
    if (CLAUSE_KEYWORDS[tag].some((kw) => low.includes(kw))) hits.add(tag);
  }
  return hits;
}

// Hybrid retrieval weights. Dense (semantic) carries the bulk; a sparse lexical
// overlap term rescues exact-phrase matches that mean-pooling washes out
// ("uncapped", "work product"); a clause-affinity bonus lifts precedents whose
// clause the query is explicitly about. Tuned so a strong off-clause semantic
// match can still rank, but on-topic precedents are not buried under boilerplate.
const W_SEMANTIC = 0.55;
const W_LEXICAL = 0.3;
const W_CLAUSE = 0.15;

// Retrieve the top-k precedents for a query with a hybrid score: dense cosine +
// sparse lexical overlap + a clause-affinity boost. Indexes (or re-indexes on a
// provider change) on demand so a fresh corpus still returns results. Returns an
// empty list only if embedding the query itself fails.
export async function retrieve(query: string, k = 4): Promise<RetrievedPrecedent[]> {
  if (!query || !query.trim()) return [];
  let store = await readStore();
  const { provider } = await embeddingInfo();
  if (needsReindex(store, provider)) {
    try {
      await indexAll();
      store = await readStore();
    } catch {
      return [];
    }
  }
  let qVec: number[];
  try {
    qVec = await embedText(query);
  } catch {
    return [];
  }
  // Provider-independent signals: sparse lexical vector of the query, and the
  // clause families the query mentions. Computed once, reused across all docs.
  const qLex = lexicalEmbed(query);
  const qClauses = inferQueryClauses(query);

  const ranked = store.docs
    .filter(hasEmbedding)
    .map((d) => {
      const semantic = cosine(qVec, d.embedding as number[]);
      const lexical = cosine(qLex, lexicalEmbed(docEmbedText(d)));
      const clause = d.clauseTag && qClauses.has(d.clauseTag) ? 1 : 0;
      const score = W_SEMANTIC * semantic + W_LEXICAL * lexical + W_CLAUSE * clause;
      return { doc: d, score };
    })
    .sort((a, b) => b.score - a.score);

  // When the query spans more than one clause family ("uncapped liability AND
  // vendor owns the work product"), keep the strongest family from taking every
  // slot so the second clause still surfaces in the preview. Cap how many slots
  // any single clause may hold, then backfill by pure score if the corpus is thin
  // on the other clauses. Single-clause queries never trip the cap, so their
  // results stay in straight score order.
  let top: typeof ranked;
  if (qClauses.size >= 2) {
    const perClauseCap = Math.max(1, Math.ceil(k * 0.6));
    const taken: Record<string, number> = {};
    top = [];
    for (const item of ranked) {
      if (top.length >= k) break;
      const tag = item.doc.clauseTag ?? `__null-${top.length}`;
      if ((taken[tag] ?? 0) >= perClauseCap) continue;
      taken[tag] = (taken[tag] ?? 0) + 1;
      top.push(item);
    }
    if (top.length < k) {
      for (const item of ranked) {
        if (top.length >= k) break;
        if (!top.includes(item)) top.push(item);
      }
    }
  } else {
    top = ranked.slice(0, k);
  }

  return top.map(({ doc, score }) => toPrecedent(doc, Math.max(0, Math.min(1, score))));
}

// Keywords per clause tag, used to pull the single most relevant clause sentence
// out of a contract's full text. The reviewer needs the exact line that drove the
// call, not the whole document. Lexical and deterministic on purpose: the excerpt
// must be the contract's own words, verbatim, so it stands up to an audit.
const CLAUSE_KEYWORDS: Record<string, string[]> = {
  net_payment_terms: ["net ", "payment term", "payment due", "days of receipt", "days of invoice", "invoice date", "payable", "net 30", "net 60", "net 15", "due within", "remit payment"],
  limitation_of_liability: ["liability", "liable", " cap", "uncapped", "unlimited", "consequential", "indemnif", "aggregate liability"],
  confidentiality: ["confidential", "non-disclosure", "nondisclosure", "nda", "proprietary"],
  ip_ownership: ["intellectual property", "work product", "deliverable", "ownership", " owns", "assign", "work made for hire", "license back", "retain all"],
  data_privacy: ["data processing", "data protection", "dpa", "personal data", "phi", "pii", "gdpr", "hipaa", "privacy"],
  key_dates: ["effective date", "effective as of", "backdat", "retroactive", "precedence", "supersede", "amend", "change order"],
  governing_law: ["governing law", "governed by", "laws of", "jurisdiction", "venue"],
  corporate_address: ["address", "principal place", "registered office", "headquarter", "located at", "suite"],
  auto_renewal: ["renew", "automatically renew", "auto-renew", "successive", "evergreen", "non-renewal"],
  invoice_schedule_math: ["invoice", "not to exceed", "not-to-exceed", "schedule", "milestone", "subtotal", "amount due"],
  order_of_precedence: ["precedence", "order of precedence", "conflict", "govern in the event", "supersede", "control in the event"],
};

// Break text into trimmed sentences. Splits on sentence punctuation and newlines;
// dependency-free and good enough to isolate a single clause line.
function toSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.;:])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

// A leading clause/section number such as "8.1", "5.3", "12.", "Section 4.", or
// "(a)" carries no contract substance; strip it so the excerpt reads as the
// clause itself and the section digits do not masquerade as a threshold number.
function stripSectionNumber(s: string): string {
  return s
    .replace(/^\s*(?:section|article|clause)\s+\d+(?:\.\d+)*\.?\s+/i, "")
    .replace(/^\s*\d+(?:\.\d+)*\.?\)?\s+/, "")
    .replace(/^\s*\([a-z0-9]{1,3}\)\s+/i, "")
    .trim();
}

// A sentence that is really just a section heading ("Cap on Liability.",
// "Deliverables.", "Vendor IP.") states no threshold and is useless as the clause
// line shown to a reviewer. After the number is stripped, a heading is short and
// titular, so the reviewer would learn nothing from it. These get skipped in
// favour of the sentence that actually states the term.
function isHeadingLike(body: string): boolean {
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return true;
  if (body.length < 28 && !/\d/.test(body)) return true;
  return false;
}

// The single clause sentence in `text` most relevant to `clauseTag`, scored by
// keyword hits with a small bonus for sentences carrying a real number (the
// threshold-bearing clauses — caps, terms, dates — usually have one). The leading
// section number is stripped first, and bare section headings are skipped, so the
// reviewer sees the line that states the actual term ("…SHALL NOT EXCEED
// $250,000"), not its title ("8.1 Cap on Liability."). Returns a trimmed, verbatim
// excerpt; falls back to the longest substantive line when nothing matches.
function clauseExcerptOf(text: string, clauseTag: string | null, maxLen = 260): string {
  const sentences = toSentences(text);
  if (sentences.length === 0) return "";
  const kws = (clauseTag && CLAUSE_KEYWORDS[clauseTag]) || [];
  let best = "";
  let bestScore = -Infinity;
  let bestHits = 0;
  let longestBody = "";
  sentences.forEach((s, idx) => {
    const body = stripSectionNumber(s);
    if (body.length > longestBody.length) longestBody = body;
    if (isHeadingLike(body)) return; // never show a bare section title as the clause line
    const low = body.toLowerCase();
    let hits = 0;
    for (const kw of kws) if (low.includes(kw)) hits += 1;
    // A real content digit (a cap amount, "Net 60", a year) now signals the
    // threshold-bearing line; the stripped section number no longer counts.
    const score = hits + (/\d/.test(body) ? 0.25 : 0) - idx * 0.001;
    if (score > bestScore) { bestScore = score; best = body; bestHits = hits; }
  });
  if (bestHits === 0 || !best) best = longestBody || stripSectionNumber(sentences[0]);
  return best.length > maxLen ? best.slice(0, maxLen - 1).trimEnd() + "…" : best;
}

// A grounded pass/flag suggestion for a NEW document, before it is logged. The
// suggestion is the disposition of the nearest labeled precedent: retrieval
// grounds the call, an attorney confirms it. Same auditable boundary the eval
// measures, applied to an unseen doc instead of a held-out one.
export interface ClassifySuggestion {
  clauseTag: string | null;        // the clause the nearest precedent is about
  suggestedLabel: CorpusLabel;     // pass | flag, from that precedent
  confidence: number;              // cosine similarity to the nearest precedent
  basis: string;                   // plain-English why, naming the precedent
  clauseExcerpt: string;           // the contract's own clause line that drove the call
  precedentTitle: string;          // the precedent compared against ("" if none)
  precedentLabel: CorpusLabel | null; // its disposition: pass = approved, flag = failed
  precedentExcerpt: string;        // that precedent's specific clause threshold, verbatim
  neighbors: RetrievedPrecedent[]; // top precedents as supporting evidence
  duplicateOf: string | null;      // title of a near-identical doc already in the corpus, or null
}

// Above this cosine similarity to an existing corpus doc, a new upload is treated
// as a near-duplicate of one already on file. High enough that only genuine
// re-uploads (or trivially reworded copies) trip it, not merely similar contracts.
const DUPLICATE_THRESHOLD = 0.985;

// Normalize text for an exact-duplicate comparison: lowercase, collapse all
// whitespace, drop surrounding noise. Catches the same file uploaded twice even
// when the title differs, without depending on the embedding provider.
function normForDup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Classify a BATCH of new documents against the existing corpus. All inputs are
// embedded in a single embedMany call (one model load, one network round-trip)
// so a 100-contract upload does not pay per-doc embedding latency. For each input
// we find its nearest labeled precedent and propose that precedent's disposition
// and clause as a SUGGESTION the attorney reviews before the doc is logged, and we
// flag near-duplicates of docs already in the corpus so a batch re-upload does not
// silently double-count. When no labeled precedent exists (or embedding fails),
// default to flag so an unsure case escalates rather than silently passing.
export async function classifyDocs(
  inputs: { title: string; text: string }[]
): Promise<ClassifySuggestion[]> {
  if (inputs.length === 0) return [];
  let store = await readStore();
  const { provider } = await embeddingInfo();
  if (needsReindex(store, provider)) {
    try {
      await indexAll();
      store = await readStore();
    } catch {
      // classify with whatever vectors already exist
    }
  }
  const labeled = store.docs.filter(
    (d) => (d.label === "pass" || d.label === "flag") && hasEmbedding(d)
  );

  // One batched embedding call for the whole upload. If it fails, every input
  // falls back to the embed-failure suggestion (flag for review).
  let vectors: number[][] | null = null;
  try {
    vectors = await embedMany(inputs.map((inp) => `${inp.title}\n${inp.text}`));
  } catch {
    vectors = null;
  }

  return inputs.map((inp, i) => {
    const q = vectors ? vectors[i] : null;
    if (!q) {
      return {
        clauseTag: null,
        suggestedLabel: "flag" as CorpusLabel,
        confidence: 0,
        basis: "Could not embed this document; defaulting to flag for attorney review.",
        clauseExcerpt: clauseExcerptOf(inp.text, null),
        precedentTitle: "",
        precedentLabel: null,
        precedentExcerpt: "",
        neighbors: [],
        duplicateOf: null,
      };
    }

    // Near-duplicate check against the whole corpus. Two signals: an exact
    // normalized-text match (the reliable "this same file was already uploaded"
    // case, independent of embedder or title), and a high embedding cosine for
    // reworded copies. Text match wins; cosine is the fallback.
    const qNorm = normForDup(inp.text);
    let duplicateOf: string | null = null;
    let dupBest = -Infinity;
    let dupBestTitle: string | null = null;
    for (const d of store.docs) {
      if (!duplicateOf && d.text && normForDup(d.text) === qNorm) duplicateOf = d.title;
      if (hasEmbedding(d)) {
        const s = cosine(q, d.embedding as number[]);
        if (s > dupBest) { dupBest = s; dupBestTitle = d.title; }
      }
    }
    if (!duplicateOf && dupBest >= DUPLICATE_THRESHOLD) duplicateOf = dupBestTitle;

    const scored = labeled
      .map((d) => ({ doc: d, score: cosine(q, d.embedding as number[]) }))
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      return {
        clauseTag: null,
        suggestedLabel: "flag" as CorpusLabel,
        confidence: 0,
        basis: "No labeled precedent to compare against; defaulting to flag for attorney review.",
        clauseExcerpt: clauseExcerptOf(inp.text, null),
        precedentTitle: "",
        precedentLabel: null,
        precedentExcerpt: "",
        neighbors: [],
        duplicateOf,
      };
    }
    const top = scored[0];
    return {
      clauseTag: top.doc.clauseTag,
      suggestedLabel: top.doc.label,
      confidence: top.score,
      basis: `Nearest precedent "${top.doc.title}" was ${top.doc.label === "pass" ? "passed" : "flagged"}. ${top.doc.note}`,
      clauseExcerpt: clauseExcerptOf(inp.text, top.doc.clauseTag),
      precedentTitle: top.doc.title,
      precedentLabel: top.doc.label,
      precedentExcerpt: clauseExcerptOf(top.doc.text, top.doc.clauseTag),
      neighbors: scored.slice(0, 3).map(({ doc, score }) => toPrecedent(doc, score)),
      duplicateOf,
    };
  });
}

export interface EvalResult {
  evaluated: number;        // labeled docs tested
  correct: number;          // nearest labeled neighbor agreed
  accuracy: number;         // correct / evaluated, 0..1
  perLabel: { label: CorpusLabel; evaluated: number; correct: number }[];
  note: string;
}

// Leave-one-out eval over the labeled corpus. For each pass/flag doc, hide it,
// find its nearest labeled neighbor, and check whether that neighbor shares its
// label. This is the "tested against N past contracts, agreed X% of the time"
// credibility number. It measures retrieval as a grounding signal, not the
// correctness of the playbook's flag decision.
export async function evaluate(): Promise<EvalResult> {
  let store = await readStore();
  const { provider } = await embeddingInfo();
  if (needsReindex(store, provider)) {
    await indexAll();
    store = await readStore();
  }
  const labeled = store.docs.filter(
    (d) => (d.label === "pass" || d.label === "flag") && hasEmbedding(d)
  );
  let correct = 0;
  const tally: Record<string, { evaluated: number; correct: number }> = {
    pass: { evaluated: 0, correct: 0 },
    flag: { evaluated: 0, correct: 0 },
  };
  for (const target of labeled) {
    const others = labeled.filter((d) => d.id !== target.id);
    if (others.length === 0) continue;
    let best = others[0];
    let bestScore = -1;
    for (const o of others) {
      const s = cosine(target.embedding as number[], o.embedding as number[]);
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    const agreed = best.label === target.label;
    tally[target.label].evaluated += 1;
    if (agreed) {
      correct += 1;
      tally[target.label].correct += 1;
    }
  }
  const evaluated = labeled.length;
  return {
    evaluated,
    correct,
    accuracy: evaluated > 0 ? correct / evaluated : 0,
    perLabel: [
      { label: "pass", evaluated: tally.pass.evaluated, correct: tally.pass.correct },
      { label: "flag", evaluated: tally.flag.evaluated, correct: tally.flag.correct },
    ],
    note:
      "Leave-one-out over labeled precedents: nearest neighbor's disposition vs the held-out doc's. Measures retrieval as a grounding signal, not the playbook's flag decision.",
  };
}
