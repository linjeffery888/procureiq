import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { INVOICES } from "@/lib/mockData";
import { isPoDataset, loadPurchaseOrdersWithOverrides, PoDataset } from "@/lib/poRegister";
import { matchAllDeterministic } from "@/lib/matching";
import { buildLiveResults, extractJsonObject, parseAiResolutions } from "@/lib/normalizeTriage";
import { offlineTriage } from "@/lib/offlineTriage";
import { applyBatchDedup } from "@/lib/triageDedup";
import { clearTriageResult, getTriageResult, saveTriageResult } from "@/lib/triageResultStore";
import { triageBatchKey } from "@/lib/triageKey";
import { anthropicApiKey } from "@/lib/anthropicKey";
import { Invoice, MatchResult, PurchaseOrder, TriageMeta, TriageResponse } from "@/lib/types";

// The invoice/PO triage engine. The deterministic core (lib/matching.ts) owns
// the money decision: it links the clean invoices by exact PO or normalized
// vendor and runs every budget check. AI is consulted ONLY for the leftover
// exception queue, where it proposes a fuzzy vendor/PO link with a confidence
// and drafts plain-English triage for the human. The final status and budget
// call are always recomputed deterministically (in buildLiveResults), so every
// cleared invoice is auditable and a hallucinated PO is simply discarded.
//
// Robustness mirrors the sibling Legal AI extract route: a live present-back
// cannot crash on a malformed model response and cannot go dark if no key is
// set or the API rate-limits. So the model output is parsed forgivingly, the
// deterministic engine stands in when the live path is unavailable, and the
// response always carries a meta block stating which engine ran.

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_INSTRUCTIONS = `You are an accounts-payable exception-triage assistant for Iovance Biotherapeutics' procurement team.

A deterministic engine has ALREADY matched every clean invoice to its purchase order and run every budget check. You are handed ONLY the leftover exception queue: invoices a rule could not confidently resolve. A human approves every one of your suggestions before anything clears.

Your job for each invoice:
1. If the invoice has no purchase order linked, try to resolve it to exactly ONE open PO from the provided list by reconciling vendor-name variations: dropped corporate suffixes ("BioReliance QC" -> "BioReliance QC Labs"), abbreviations ("Veritas Cloud Infra" -> "Veritas Cloud Infrastructure"), or reworded names. Only propose a PO when the vendor genuinely matches. If no open PO plausibly fits, return null: that invoice needs a human to source a PO.
2. Assign a confidence from 0 to 1 for the link. Use >= 0.85 only when the vendor match is unambiguous. Use 0.6 to 0.85 when it is likely but a human should confirm. Use below 0.6 when you are guessing.
3. Draft a one or two sentence plain-English explanation for the human reviewer, and a concrete suggested next action.

You NEVER decide whether an invoice is within budget and you NEVER set its final status; the deterministic engine does that from your proposed link. Do not invent PO numbers that are not in the list.

Return ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{
  "resolutions": [
    {
      "invoiceNumber": string,
      "resolvedPoNumber": string | null,
      "confidence": number,
      "reasoning": string,
      "explanation": string,
      "suggestedResolution": string
    }
  ]
}`;

function meta(engine: TriageMeta["engine"], model: string | null, latencyMs: number, note: string): TriageMeta {
  return { engine, model, latencyMs, note };
}

// Compact the open POs and the exception queue into the user prompt. The queue
// is the deterministic baseline rows that did not auto-clear, with their current
// status so the model has the context a human would.
function buildUserPrompt(pos: PurchaseOrder[], queue: MatchResult[]): string {
  const poLines = pos
    .map((p) => `- ${p.poNumber} | vendor: ${p.vendor} | work order: ${p.workOrder} | remaining: ${p.remaining}`)
    .join("\n");

  const invLines = queue
    .map((r) => {
      const inv = r.invoice;
      const claimed = inv.poNumberClaimed ? inv.poNumberClaimed : "none cited";
      return `- ${inv.invoiceNumber} | vendor: "${inv.vendor}" | amount: ${inv.amount} | PO cited: ${claimed} | line items: ${inv.lineItems.join("; ")} | deterministic status: ${r.status}`;
    })
    .join("\n");

  return `OPEN PURCHASE ORDERS:\n${poLines}\n\nEXCEPTION QUEUE (resolve and triage each):\n${invLines}`;
}

// Return the last persisted triage run so the page can show it on mount without
// re-running. Triage now runs only when the user presses Run.
export async function GET() {
  return NextResponse.json(await getTriageResult());
}

// Clear the persisted triage run (a reset convenience).
export async function DELETE() {
  await clearTriageResult();
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  // The data is server-owned synthetic data; the request body is optional and
  // exists only so a future caller could pass its own batch. Parse defensively.
  //
  // `dataset` selects the PO lookup the invoice check resolves against:
  //   demo (default) -> the curated golden-demo POs, so the on-load demo is
  //                     unchanged; corpus -> the generated PO register; all -> both.
  // An explicit `purchaseOrders` array still overrides everything (e.g. a caller
  // passing its own register slice). See lib/poRegister.ts.
  let invoices: Invoice[] = INVOICES;
  let dataset: PoDataset = "demo";
  let explicitPos: PurchaseOrder[] | null = null;
  let forceOffline = false;
  try {
    const body = await req.json();
    if (body && Array.isArray(body.invoices) && body.invoices.length) invoices = body.invoices;
    if (isPoDataset(body?.dataset)) dataset = body.dataset;
    if (body && Array.isArray(body.purchaseOrders) && body.purchaseOrders.length) explicitPos = body.purchaseOrders;
    // The top-bar Engine toggle. Offline forces the deterministic engine even
    // when a key is present, so the heuristic path can be demoed on demand.
    forceOffline = body?.forceOffline === true;
  } catch {
    // No body or invalid JSON: fall back to the bundled synthetic batch.
  }

  // Resolve the PO universe the check runs against, with any human edits from the
  // PO register applied: an overridden `remaining` actually changes what the next
  // invoice budget check resolves against (see lib/poRegister + poOverridesStore).
  // An explicit purchaseOrders array in the body still overrides everything.
  const pos: PurchaseOrder[] = explicitPos ?? (await loadPurchaseOrdersWithOverrides(dataset));

  // The deterministic baseline always runs. It is both the offline result and
  // the source of the exception queue we hand to the model.
  const baseline = matchAllDeterministic(invoices, pos);
  const queue = baseline.filter((r) => r.status !== "matched");

  // Persist every run so the page can show the last result on mount without
  // re-running, tagged with the batch signature so a stale result can be flagged.
  const batchKey = triageBatchKey(forceOffline, invoices);
  const respond = async (res: TriageResponse): Promise<NextResponse> => {
    await saveTriageResult(res, batchKey);
    return NextResponse.json(res);
  };

  const offline = (note: string): Promise<NextResponse> => {
    const res: TriageResponse = {
      results: applyBatchDedup(offlineTriage(invoices, pos)),
      meta: meta("offline-deterministic", null, Date.now() - started, note),
    };
    return respond(res);
  };

  // Resolve the key once, the same way for the gate and the live client, so an
  // empty ANTHROPIC_API_KEY in the shell can't shadow the real key in .env.local.
  const apiKey = anthropicApiKey();

  // --- Offline path: no key, or the Engine toggle forced it. Deterministic
  // engine only, so the demo still renders fully. ---
  if (forceOffline || !apiKey) {
    return offline(
      forceOffline && apiKey
        ? "Offline deterministic mode: the Engine toggle is set to Offline, so fuzzy vendor matches were not attempted and exception triage was templated, not drafted by the model. The money decision (PO link + budget check) is identical to the live path. Switch the toggle to Live for AI triage."
        : "Offline deterministic mode: no ANTHROPIC_API_KEY set, so fuzzy vendor matches were not attempted and exception triage was templated, not drafted by the model. The money decision (PO link + budget check) is identical to the live path. Set a key in .env.local for live AI triage.",
    );
  }

  // Nothing ambiguous to resolve: skip the model call entirely.
  if (queue.length === 0) {
    const res: TriageResponse = {
      results: applyBatchDedup(baseline),
      meta: meta("live", MODEL, Date.now() - started, `Every invoice cleared deterministically; no exception queue for ${MODEL} to triage.`),
    };
    return respond(res);
  }

  // --- Live path: ask Claude to resolve + triage the queue, parse forgivingly ---
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      // A large exception queue (many uploaded invoices, each with reasoning +
      // triage prose) can run past 2k output tokens and truncate the JSON; give
      // headroom. The parser also repairs a truncated tail as a backstop.
      max_tokens: 4000,
      temperature: 0,
      // Temperature 0 keeps the triage stable across re-runs in a demo. The
      // system prompt is static; production on Bedrock would prompt-cache it.
      system: SYSTEM_INSTRUCTIONS,
      messages: [{ role: "user", content: buildUserPrompt(pos, queue) }],
    });

    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    const parsed = extractJsonObject(raw);
    if (parsed == null) {
      return offline(
        "Live model response could not be parsed as JSON; fell back to the deterministic engine. The money decision is unchanged. Re-run to retry the live triage.",
      );
    }

    const aiResolutions = parseAiResolutions(parsed);
    const results = applyBatchDedup(buildLiveResults(invoices, pos, aiResolutions));
    const res: TriageResponse = {
      results,
      meta: meta("live", MODEL, Date.now() - started, `Live exception triage by ${MODEL} on ${queue.length} flagged invoice(s). The budget check and final status are deterministic; a human approves every exception.`),
    };
    return respond(res);
  } catch (err: any) {
    return offline(
      `Live engine unavailable (${err?.message ?? "API error"}); fell back to the deterministic engine. The clean invoices below still cleared by rule.`,
    );
  }
}
