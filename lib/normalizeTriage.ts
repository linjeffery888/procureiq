// Turns whatever the model returned for the exception queue into audited
// MatchResults, defensively. The model only ever does two things here: propose
// a fuzzy PO link (a poNumber + confidence) for an invoice the deterministic
// core could not link, and draft plain-English triage prose for a human. It
// never decides budget or final status. So this module:
//   1. parses the model output forgivingly into a per-invoice map, and
//   2. rebuilds every result by running the DETERMINISTIC core again, swapping
//      in the AI link only when it clears the confidence floor and points at a
//      real open PO, then overlaying the AI's drafted prose on rows that still
//      need a human.
// Every coercion is defensive: a live present-back cannot crash on a missing
// field, a stray string where a number belongs, or an omitted invoice. The
// money decision (PO link validity + budget check) is always recomputed here by
// rule, so an AI hallucinated PO number that does not exist is simply ignored.

import { finalizeMatch, resolveDeterministic, REVIEW_FLOOR_CONFIDENCE, Resolution } from "./matching";
import { Invoice, MatchResult, PurchaseOrder } from "./types";

// One parsed, sanitized resolution proposed by the model for a single invoice.
export interface AiResolution {
  invoiceNumber: string;
  resolvedPoNumber: string | null; // the PO the model thinks this invoice belongs to, or null
  confidence: number;              // 0..1, clamped
  reasoning: string;               // why the model linked it (becomes an audit step)
  explanation: string;             // human-readable triage for the reviewer
  suggestedResolution: string;     // next action for the human
}

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function asPoNumber(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const lower = s.toLowerCase();
  // The model is told to return null when it cannot find a PO; tolerate the
  // common ways it might say so in a string field instead.
  if (["null", "none", "n/a", "na", "unknown", "no po", "no match"].includes(lower)) return null;
  return s;
}

function asConfidence(v: unknown): number {
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (cleaned) {
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) n = parsed;
    }
  }
  if (n == null) return 0;
  if (n > 1 && n <= 100) n = n / 100; // tolerate "92" meaning 92%
  return Math.max(0, Math.min(1, n));
}

// Coerce the raw model object into a map keyed by invoice number. Accepts either
// { resolutions: [...] } or a bare array, and silently drops anything malformed.
export function parseAiResolutions(raw: unknown): Map<string, AiResolution> {
  const out = new Map<string, AiResolution>();
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as any).resolutions)
      ? (raw as any).resolutions
      : [];

  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const invoiceNumber = asString((r as any).invoiceNumber);
    if (!invoiceNumber) continue;
    out.set(invoiceNumber, {
      invoiceNumber,
      resolvedPoNumber: asPoNumber((r as any).resolvedPoNumber),
      confidence: asConfidence((r as any).confidence),
      reasoning: asString((r as any).reasoning),
      explanation: asString((r as any).explanation),
      suggestedResolution: asString((r as any).suggestedResolution),
    });
  }
  return out;
}

// Rebuild every invoice's result with the deterministic core, swapping in an AI
// link only where the core could not link and the model proposed a real PO at
// or above the review floor. Overlays AI-drafted prose on rows that still need a
// human. The status and budget call are always deterministic.
export function buildLiveResults(
  invoices: Invoice[],
  pos: PurchaseOrder[],
  aiResolutions: Map<string, AiResolution>,
): MatchResult[] {
  return invoices.map((inv) => {
    const det = resolveDeterministic(inv, pos);
    const ai = aiResolutions.get(inv.invoiceNumber);

    let res: Resolution = det;
    let aiAttempted = false;

    // The AI is only consulted when a rule could not establish the PO link.
    if (!det.po) {
      aiAttempted = true;
      if (ai && ai.resolvedPoNumber) {
        const po = pos.find((p) => p.poNumber === ai.resolvedPoNumber);
        // Trust the AI link only if the PO actually exists and the model cleared
        // the floor. A hallucinated or low-confidence link is discarded; the row
        // stays a no_po exception for a human.
        if (po && ai.confidence >= REVIEW_FLOOR_CONFIDENCE) {
          res = {
            po,
            source: "ai",
            method: "AI",
            confidence: ai.confidence,
            reason: ai.reasoning || `AI resolved "${inv.vendor}" to ${po.vendor} (${po.poNumber}).`,
          };
        }
      }
    }

    const result = finalizeMatch(inv, res, aiAttempted);

    // Let the model's drafted prose stand in for the templated triage on rows
    // that still need a human (exceptions and medium-confidence confirms). The
    // status, matched PO, and budget audit step are untouched: AI improves the
    // explanation, it never changes the money decision.
    if (ai && result.needsHuman && (ai.explanation || ai.suggestedResolution)) {
      if (ai.explanation) result.explanation = ai.explanation;
      if (ai.suggestedResolution) result.suggestedResolution = ai.suggestedResolution;
      result.audit.push({
        label: "Exception triage",
        source: "ai",
        detail: "Plain-English triage drafted by AI for the human reviewer.",
        confidence: ai.confidence,
      });
    }

    return result;
  });
}

// Pull the first balanced JSON object out of arbitrary model text. Handles a
// ```json fence and stray prose around the JSON. If the object is truncated (the
// model hit its output-token cap mid-response), repair the open tail so the
// salvageable prefix still parses. Returns null only when nothing usable is found.
// (Duplicated rather than shared so this app stays standalone from the sibling.)
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          break; // balanced but invalid: fall through to repair
        }
      }
    }
  }

  return repairTruncatedJson(candidate.slice(start));
}

// Best-effort repair of a JSON object truncated mid-stream. Closes an open
// string, drops a dangling trailing key or comma, then closes every still-open
// array/object, trimming back element by element until a prefix parses.
function repairTruncatedJson(s: string): unknown | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let body = s;
  if (inString) body += '"';

  for (let attempt = 0; attempt < 200; attempt++) {
    let trimmed = body.replace(/\s+$/, "");
    trimmed = trimmed.replace(/,\s*$/, "");
    trimmed = trimmed.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
    const closed = trimmed + stack.slice().reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      return JSON.parse(closed);
    } catch {
      const cut = Math.max(trimmed.lastIndexOf(","), trimmed.lastIndexOf("{"), trimmed.lastIndexOf("["));
      if (cut <= 0) return null;
      body = trimmed.slice(0, cut);
    }
  }
  return null;
}
