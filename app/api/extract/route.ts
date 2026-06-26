import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { playbookForPrompt } from "@/lib/playbook";
import { normalizeExtraction, extractJsonObject } from "@/lib/normalizeExtraction";
import { offlineExtraction } from "@/lib/offlineExtraction";
import { retrieve, getStatus } from "@/lib/corpus";
import { ExtractionResponse, ExtractionMeta, RetrievalContext, RetrievedPrecedent } from "@/lib/types";

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
  try {
    const body = await req.json();
    contractText = body?.contractText;
    useKnowledge = body?.useKnowledge === true;
    // The top-bar Engine toggle. When the presenter selects Offline, force the
    // deterministic heuristic even if a key is present, so both paths can be
    // demoed on demand.
    forceOffline = body?.forceOffline === true;
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

  // Optional precedent grounding from the Knowledge module (evidence only).
  const { context: retrieval, promptBlock } = await buildGrounding(useKnowledge, text);

  // --- Offline path: no key, or the Engine toggle forced it. Run the
  // deterministic heuristic so the demo still works. ---
  if (forceOffline || !process.env.ANTHROPIC_API_KEY) {
    const extraction = offlineExtraction(text);
    const note = forceOffline && process.env.ANTHROPIC_API_KEY
      ? "Offline heuristic mode: the Engine toggle is set to Offline, so this used deterministic pattern matching, not the model. Switch the toggle to Live for the Claude first pass."
      : "Offline heuristic mode: no ANTHROPIC_API_KEY set, so this used deterministic pattern matching, not the model. Set a key in .env.local for the live Claude first pass.";
    const res: ExtractionResponse = {
      ...extraction,
      _meta: meta("offline-heuristic", null, Date.now() - started, note, retrieval),
    };
    return NextResponse.json(res);
  }

  // --- Live path: call Claude, parse forgivingly, normalize, and fall back on failure ---
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
      const extraction = offlineExtraction(text);
      const res: ExtractionResponse = {
        ...extraction,
        _meta: meta("offline-heuristic", null, Date.now() - started, "Live model response could not be parsed as JSON; fell back to the offline heuristic. Re-run to retry the live engine.", retrieval),
      };
      return NextResponse.json(res);
    }

    const extraction = normalizeExtraction(parsed);
    const groundingNote = retrieval?.used
      ? ` Grounded in ${retrieval.precedents.length} Iovance precedent(s) as evidence.`
      : "";
    const res: ExtractionResponse = {
      ...extraction,
      _meta: meta("live", MODEL, Date.now() - started, `Live first pass by ${MODEL}. An attorney confirms before execution.${groundingNote}`, retrieval),
    };
    return NextResponse.json(res);
  } catch (err: any) {
    // API error (auth, rate limit, network). Keep the demo alive with the
    // heuristic and report what happened.
    const extraction = offlineExtraction(text);
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
