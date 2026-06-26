import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { playbookForPrompt } from "@/lib/playbook";
import { normalizeExtraction, extractJsonObject } from "@/lib/normalizeExtraction";
import { offlineExtraction } from "@/lib/offlineExtraction";
import { readThresholds } from "@/lib/thresholdStore";
import { anthropicApiKey } from "@/lib/anthropicKey";
import { extractCacheKey, getCachedExtraction, putCachedExtraction } from "@/lib/extractCache";
import { getPinnedSampleExtraction } from "@/lib/sampleCache";
import { retrieve, getStatus } from "@/lib/corpus";
import { ContractExtraction, ExtractionResponse, ExtractionMeta, RetrievalContext, RetrievedPrecedent } from "@/lib/types";

// The extraction engine. This is the whole product's core: read a contract
// ONCE into structured data + a first-pass playbook review. Everything
// downstream (the redline here, the invoice match key and accrual basis in
// the sibling app) reuses this output.
//
// Robustness is deliberate. A live present-back cannot crash on a malformed
// model response, a missing field, or empty input, and it cannot go dark if
// no key is set or the API rate-limits. So: every model response is parsed
// forgivingly and normalized to a guaranteed shape, and the offline heuristic
// stands in when the live path is unavailable. The response always carries a
// _meta block stating which engine ran, so we never imply the model did work
// it did not.

export const runtime = "nodejs";
// The full first-pass JSON (eight findings, each with rationale + redline, plus
// the extracted terms with source quotes) runs well past 3k output tokens on a
// real contract. A complete response at temperature 0 takes ~60s, so give the
// route headroom to finish rather than have the platform cut it off.
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_INPUT_CHARS = 60000; // guardrail against runaway payloads

const SYSTEM_INSTRUCTIONS = `You are a first-pass contract reviewer for Iovance Biotherapeutics' IT procurement.
A human attorney always confirms before execution; your job is the repetitive first pass that clears routine paper and surfaces only what deviates.

Iovance standard-terms playbook (the finite checklist to review against):
${playbookForPrompt()}

Review the contract the user provides. Return ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{
  "vendor": string | null,
  "counterpartyType": string | null,
  "totalValue": number | null,
  "currency": string | null,
  "startDate": string | null,
  "endDate": string | null,
  "termMonths": number | null,
  "paymentSchedule": string | null,
  "autoRenewal": boolean | null,
  "governingLaw": string | null,
  "contractId": string | null,
  "parentReference": {
    "isAmendment": boolean,
    "instrumentType": "base" | "amendment" | "sow" | "renewal",
    "parentContractId": string | null,
    "parentTitle": string | null,
    "parentDate": string | null,
    "counterpartyEntity": string | null,
    "rawReference": string | null
  } | null,
  "terms": [{ "key": string, "label": string, "value": string | null, "sourceQuote": string | null }],
  "findings": [{
    "termKey": string,
    "label": string,
    "found": string | null,
    "standard": string,
    "severity": "ok" | "review" | "flag",
    "rationale": string,
    "suggestedRedline": string
  }],
  "summary": string
}

Rules:
- severity "ok" when the term matches the acceptable position.
- severity "review" when it is borderline, missing but low-risk, or you are not confident.
- severity "flag" when it violates the escalate-if condition (e.g. uncapped liability, vendor owns IP, no DPA where personal data is processed, sub-Net-30 terms, auto-renew with short notice, non-US law).
- suggestedRedline: one sentence of proposed replacement language Iovance would send back. Empty string if severity is ok.
- paymentSchedule: capture the cadence and amount precisely (e.g. "Net 15, total $480,000" or "Quarterly, $55,000"). This field is reused downstream as the invoice match key and accrual basis, so be exact.
- Cover every one of the eight playbook items in findings, even if the term is absent (found: null).
- contractId: the document's OWN contract identifier if it prints one (e.g. "Contract No. IOV-MSA-2024-0142", "Change Order No. IOV-CO-2024-0142-02"). null if the document states no identifier. Do not invent one.
- parentReference: capture the parent this document depends on, used downstream to evaluate a family as one unit.
  - For a base agreement that stands on its own (an MSA, software license, or NDA that is not issued under anything), set parentReference to null.
  - For a change order, addendum, amendment, SOW, or renewal that is issued under or modifies a parent, set isAmendment true and fill instrumentType ("amendment" for change order/addendum/amendment, "sow" for a statement of work, "renewal" for a renewal).
  - parentContractId: the parent's Contract No. exactly as cited (e.g. the MSA number a change order is issued under), or null if the document cites a parent only by title and date with no number.
  - parentTitle: the parent's title as named (e.g. "Master Services Agreement"). parentDate: the parent's date as cited. counterpartyEntity: the vendor/counterparty named. rawReference: the exact sentence the citation was read from.
  - Capture only what the text states. Do not guess a parent id, and do not link to a separate agreement just because it shares the vendor.
- Amendments inherit the parent. If the document is an amendment, change order, addendum, SOW, or renewal that incorporates a parent agreement by reference (look for "incorporates by reference", "pursuant to the Master Agreement", "Original SOW", an order-of-precedence clause, or similar), then any standard playbook clause that is simply absent from this document is governed by the parent and is NOT a deviation. Mark such absent-and-inherited clauses severity "ok" with found: null and a rationale like "Inherited from the parent agreement; not restated in this amendment." Only assign "review" or "flag" to a clause when THIS document actually sets or changes a term that deviates from the playbook. Do not flag a clean change order just because it does not restate the full MSA.
- Base every finding on the contract text only. Do not invent terms.`;

function meta(
  engine: ExtractionMeta["engine"],
  model: string | null,
  latencyMs: number,
  note: string,
  retrieval?: RetrievalContext
): ExtractionMeta {
  return { engine, model, latencyMs, note, retrieval };
}

function termValue(ex: ContractExtraction, key: string): string | null {
  return ex.terms.find((t) => t.key === key)?.value ?? null;
}

// Low-confidence gating: decide whether the deterministic playbook read this
// contract well enough to stand on its own, so the ~60s model call can be
// skipped. The signal is coverage of the core terms the budget line and the
// most common flags depend on. Vendor and payment terms must always be present;
// an amendment that cites a parent always escalates, because the model and the
// linker need to reason about inherited terms. Missing core terms mean
// non-standard language the model should read. The bar is deliberately
// conservative: we only skip the model when the rules clearly succeeded, never
// on an ambiguous contract.
function deterministicConfidence(ex: ContractExtraction): {
  confident: boolean;
  found: number;
  total: number;
  missing: string[];
} {
  const checks: Array<[string, boolean]> = [
    ["vendor", !!ex.vendor],
    ["payment terms", !!termValue(ex, "net_payment_terms")],
    ["contract value", ex.totalValue != null],
    ["term length", ex.termMonths != null],
    ["governing law", !!ex.governingLaw],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  const found = checks.length - missing.length;
  const isAmendment = ex.parentReference?.isAmendment === true;
  const confident = !isAmendment && !!ex.vendor && !!termValue(ex, "net_payment_terms") && found >= 4;
  return { confident, found, total: checks.length, missing };
}

// Optionally ground the review in Iovance's own precedent corpus (the Knowledge
// module). Retrieval is EVIDENCE only: it tells the model how Iovance handled
// similar clauses before. The deterministic playbook still owns the pass/flag
// decision, so a wrong neighbor cannot flip a finding. Returns the context for
// _meta plus a compact grounding string to append to the prompt (empty when off
// or when nothing relevant was found).
async function buildGrounding(
  useKnowledge: boolean,
  text: string
): Promise<{ context: RetrievalContext | undefined; promptBlock: string }> {
  if (!useKnowledge) return { context: undefined, promptBlock: "" };
  let precedents: RetrievedPrecedent[] = [];
  let corpusSize = 0;
  try {
    const status = await getStatus();
    corpusSize = status.total;
    precedents = await retrieve(text.slice(0, 3000), 4);
  } catch {
    precedents = [];
  }
  const context: RetrievalContext = {
    used: precedents.length > 0,
    corpusSize,
    precedents,
  };
  if (precedents.length === 0) return { context, promptBlock: "" };
  const lines = precedents
    .map(
      (p) =>
        `- [${p.label.toUpperCase()}] ${p.title} (similarity ${(p.score * 100).toFixed(0)}%): ${p.note}`
    )
    .join("\n");
  const promptBlock = `\n\nIovance precedent (retrieved from past dispositions, as EVIDENCE only; the playbook still decides):\n${lines}\nUse these to calibrate the standard and the redline language, not to override a rule.`;
  return { context, promptBlock };
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  // --- Input validation (never crash on bad input) ---
  let contractText: string;
  let useKnowledge = false;
  let forceOffline = false;
  let forceLive = false;
  try {
    const body = await req.json();
    contractText = body?.contractText;
    useKnowledge = body?.useKnowledge === true;
    // The top-bar Engine toggle. When the presenter selects Offline, force the
    // deterministic heuristic even if a key is present, so both paths can be
    // demoed on demand.
    forceOffline = body?.forceOffline === true;
    // The contract-review "Force live AI" control. When on, skip the cache and
    // the low-confidence gate so the model runs on every contract, even clean
    // ones the rules could handle, to demo the live engine on demand.
    forceLive = body?.forceLive === true;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON with a contractText field." }, { status: 400 });
  }

  if (typeof contractText !== "string" || contractText.trim().length === 0) {
    return NextResponse.json({ error: "Paste contract text to review (the input was empty)." }, { status: 400 });
  }
  if (contractText.trim().length < 40) {
    return NextResponse.json({ error: "That looks too short to be a contract. Paste the full text to review." }, { status: 400 });
  }
  const text = contractText.slice(0, MAX_INPUT_CHARS);

  // The current clause thresholds, edited from the Knowledge corpus. The
  // deterministic engine compares against these, so every upload is judged by
  // the numbers in force right now, not a hardcoded baseline.
  const thresholds = await readThresholds();

  // Resolve the key once, the same way for the gate and the live client, so an
  // empty ANTHROPIC_API_KEY in the shell can't shadow the real key in .env.local.
  const apiKey = anthropicApiKey();

  // --- Pinned demo samples. The bundled sample contracts (notably the Apexion
  //     change order, an amendment that can't take the deterministic fast path)
  //     are served from a precomputed live review so the present-back is instant
  //     and identical every time, independent of the editable thresholds and the
  //     grounding toggle. Gated to the default live path — a real key present,
  //     not Force-offline, not Force-live — so the engine toggles and provenance
  //     honesty are untouched, and a real upload never matches a sample text. ---
  if (apiKey && !forceOffline && !forceLive) {
    const pinned = getPinnedSampleExtraction(text);
    if (pinned) {
      const { context: retrieval } = await buildGrounding(useKnowledge, text);
      const res: ExtractionResponse = {
        ...pinned,
        _meta: meta(
          "live",
          MODEL,
          Date.now() - started,
          `Bundled demo sample: this exact contract's live first pass by ${MODEL} is pinned, so the re-run is instant. Uploads always run the live engine.`,
          retrieval
        ),
      };
      return NextResponse.json(res);
    }
  }

  // --- Offline path: no key, or the Engine toggle forced it. Run the
  // deterministic heuristic so the demo still works. ---
  if (forceOffline || !apiKey) {
    const { context: retrieval } = await buildGrounding(useKnowledge, text);
    const extraction = offlineExtraction(text, thresholds);
    const note = forceOffline && apiKey
      ? "Offline heuristic mode: the Engine toggle is set to Offline, so this used deterministic pattern matching, not the model. Switch the toggle to Live for the Claude first pass."
      : "Offline heuristic mode: no ANTHROPIC_API_KEY set, so this used deterministic pattern matching, not the model. Set a key in .env.local for the live Claude first pass.";
    const res: ExtractionResponse = {
      ...extraction,
      _meta: meta("offline-heuristic", null, Date.now() - started, note, retrieval),
    };
    return NextResponse.json(res);
  }

  // --- Live mode. The deterministic pass runs first: it is the fallback for any
  //     live failure, and its term coverage is the signal for the gate below. ---
  const deterministic = offlineExtraction(text, thresholds);
  const conf = deterministicConfidence(deterministic);
  const cacheKey = extractCacheKey({
    model: MODEL,
    useKnowledge,
    thresholdsSignature: JSON.stringify(thresholds),
    text,
  });

  // Two latency guards run before the ~60s model call, unless the reviewer forced
  // the live model on (the "Force live AI" control), in which case we always call
  // it so the live engine can be demoed on a clean contract.
  if (!forceLive) {
    // 1) Content cache: an identical contract already reviewed by the model
    //    returns instantly. This is what makes re-opening a preloaded contract
    //    fast. The key folds in the thresholds and the grounding flag, so any
    //    change refreshes the review instead of serving a stale one.
    const cached = await getCachedExtraction(cacheKey);
    if (cached) {
      const res: ExtractionResponse = {
        ...cached,
        _meta: meta(
          "live",
          MODEL,
          Date.now() - started,
          `Served from cache: this exact contract was already reviewed by ${MODEL}, so the re-run is instant. Editing the contract text or the clause thresholds refreshes it.`,
          undefined
        ),
      };
      return NextResponse.json(res);
    }

    // 2) Low-confidence gating: when the deterministic playbook read every core
    //    term cleanly (and this isn't an amendment that needs parent reasoning),
    //    the rules stand on their own and the model's ~60s is not worth spending.
    //    The model is reserved for contracts the rules can't read.
    if (conf.confident) {
      const res: ExtractionResponse = {
        ...deterministic,
        _meta: meta(
          "offline-heuristic",
          null,
          Date.now() - started,
          `Deterministic playbook read the core terms cleanly (${conf.found}/${conf.total}: vendor, payment terms, value, term, governing law), so the live model was not spent on this contract. The model is reserved for non-standard contracts the rules can't read confidently.`,
          undefined
        ),
      };
      return NextResponse.json(res);
    }
  }

  // --- Live path: forced on, or the deterministic pass was not confident, so
  //     spend the model. Ground it in precedent first, then cache the result. ---
  const escalationReason = forceLive
    ? "the reviewer forced the live model on for this review"
    : deterministic.parentReference?.isAmendment
      ? "this is an amendment that needs parent-agreement reasoning"
      : conf.missing.length
        ? `the deterministic pass could not read ${conf.missing.join(", ")}`
        : "the deterministic pass was not confident";
  const { context: retrieval, promptBlock } = await buildGrounding(useKnowledge, text);
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      // 3000 was too small: the JSON for eight findings plus the extracted terms
      // truncates mid-string, leaving an unbalanced object that the parser drops,
      // which silently fell the live engine back to the offline heuristic on
      // every run. 8000 gives ~2x headroom over a complete response.
      max_tokens: 8000,
      temperature: 0,
      // Temperature 0 keeps the first pass deterministic across re-runs in a
      // demo. The instructions + playbook are static; production on Bedrock
      // would add prompt caching on this prefix to cut cost and latency.
      system: SYSTEM_INSTRUCTIONS,
      messages: [{ role: "user", content: `CONTRACT:\n"""\n${text}\n"""${promptBlock}` }],
    });

    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    const parsed = extractJsonObject(raw);
    if (parsed == null) {
      // Model returned something unparseable. Degrade to the heuristic rather
      // than show the attorney an error mid-demo.
      const res: ExtractionResponse = {
        ...deterministic,
        _meta: meta("offline-heuristic", null, Date.now() - started, "Live model response could not be parsed as JSON; fell back to the offline heuristic. Re-run to retry the live engine.", retrieval),
      };
      return NextResponse.json(res);
    }

    const extraction = normalizeExtraction(parsed);
    // Cache the model result so re-opening this exact contract is instant.
    await putCachedExtraction(cacheKey, extraction);
    const groundingNote = retrieval?.used
      ? ` Grounded in ${retrieval.precedents.length} Iovance precedent(s) as evidence.`
      : "";
    const res: ExtractionResponse = {
      ...extraction,
      _meta: meta("live", MODEL, Date.now() - started, `Live first pass by ${MODEL} (escalated because ${escalationReason}). An attorney confirms before execution.${groundingNote}`, retrieval),
    };
    return NextResponse.json(res);
  } catch (err: any) {
    // API error (auth, rate limit, network). Keep the demo alive with the
    // heuristic and report what happened.
    const extraction = deterministic;
    const res: ExtractionResponse = {
      ...extraction,
      _meta: meta(
        "offline-heuristic",
        null,
        Date.now() - started,
        `Live engine unavailable (${err?.message ?? "API error"}); fell back to the offline heuristic. The deterministic first pass below still ran.`,
        retrieval
      ),
    };
    return NextResponse.json(res);
  }
}
