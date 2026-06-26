// Turns whatever the model returned (or a parse of it) into a guaranteed
// ContractExtraction shape. The model is usually well-behaved, but a live
// demo cannot crash on a missing field, a stray string where a number
// belongs, or an omitted finding. Every coercion here is defensive: the UI
// downstream can assume the shape is sound.
//
// The most important guarantee: findings always cover all eight playbook
// items. If the model skips one, we backfill it as "review / not present"
// so the attorney never sees a silently dropped term.

import { ContractExtraction, ExtractedTerm, PlaybookFinding, Severity, ParentReference, InstrumentType } from "./types";
import { PLAYBOOK } from "./playbook";

const INSTRUMENT_TYPES: InstrumentType[] = ["base", "amendment", "sow", "renewal"];

function asInstrumentType(v: unknown): InstrumentType {
  if (typeof v === "string" && INSTRUMENT_TYPES.includes(v as InstrumentType)) {
    return v as InstrumentType;
  }
  return "base";
}

// Coerce whatever the model returned for parentReference into a guaranteed shape,
// or null when the document is not an amendment. Defensive like every other
// coercion here: a malformed link object must never crash the review.
function normalizeParentReference(raw: unknown): ParentReference | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const instrumentType = asInstrumentType(o.instrumentType);
  const isAmendment =
    asBool(o.isAmendment) ?? (instrumentType !== "base");
  // A "base" instrument that is not an amendment carries no parent link.
  if (!isAmendment && instrumentType === "base") return null;
  return {
    isAmendment: isAmendment === true,
    instrumentType,
    parentContractId: asString(o.parentContractId),
    parentTitle: asString(o.parentTitle),
    parentDate: asString(o.parentDate),
    counterpartyEntity: asString(o.counterpartyEntity),
    rawReference: asString(o.rawReference),
  };
}

const SEVERITIES: Severity[] = ["ok", "review", "flag"];

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Tolerate "$480,000", "480000 USD", etc.
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["true", "yes", "y"].includes(t)) return true;
    if (["false", "no", "n"].includes(t)) return false;
  }
  return null;
}

function asSeverity(v: unknown): Severity {
  if (typeof v === "string" && SEVERITIES.includes(v as Severity)) return v as Severity;
  return "review"; // unknown severity is safest treated as "needs a human"
}

function normalizeTerms(raw: unknown): ExtractedTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t: any) => ({
      key: asString(t.key) ?? "term",
      label: asString(t.label) ?? asString(t.key) ?? "Term",
      value: asString(t.value),
      sourceQuote: asString(t.sourceQuote) ?? undefined,
    }));
}

function normalizeFindings(raw: unknown): PlaybookFinding[] {
  const byKey = new Map<string, PlaybookFinding>();

  if (Array.isArray(raw)) {
    for (const f of raw) {
      if (!f || typeof f !== "object") continue;
      const key = asString((f as any).termKey) ?? asString((f as any).key);
      if (!key) continue;
      const rule = PLAYBOOK.find((r) => r.key === key);
      const severity = asSeverity((f as any).severity);
      byKey.set(key, {
        termKey: key,
        label: asString((f as any).label) ?? rule?.label ?? key,
        found: asString((f as any).found),
        standard: asString((f as any).standard) ?? rule?.acceptable ?? "",
        severity,
        rationale: asString((f as any).rationale) ?? "",
        suggestedRedline:
          severity === "ok" ? "" : asString((f as any).suggestedRedline) ?? "",
      });
    }
  }

  // Backfill any playbook item the model omitted so all eight always render.
  for (const rule of PLAYBOOK) {
    if (!byKey.has(rule.key)) {
      byKey.set(rule.key, {
        termKey: rule.key,
        label: rule.label,
        found: null,
        standard: rule.acceptable,
        severity: "review",
        rationale:
          "Not returned by the first-pass extraction. Confirm manually whether this term is present.",
        suggestedRedline: "",
      });
    }
  }

  // Preserve playbook order so the surface reads predictably.
  return PLAYBOOK.map((r) => byKey.get(r.key)!).filter(Boolean);
}

export function normalizeExtraction(raw: unknown): ContractExtraction {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    vendor: asString(o.vendor),
    counterpartyType: asString(o.counterpartyType),
    totalValue: asNumber(o.totalValue),
    currency: asString(o.currency) ?? (asNumber(o.totalValue) != null ? "USD" : null),
    startDate: asString(o.startDate),
    endDate: asString(o.endDate),
    termMonths: asNumber(o.termMonths),
    paymentSchedule: asString(o.paymentSchedule),
    autoRenewal: asBool(o.autoRenewal),
    governingLaw: asString(o.governingLaw),
    terms: normalizeTerms(o.terms),
    findings: normalizeFindings(o.findings),
    summary: asString(o.summary) ?? "First-pass extraction complete. Review the findings below.",
    contractId: asString(o.contractId),
    parentReference: normalizeParentReference(o.parentReference),
  };
}

// Pull the first balanced JSON object out of arbitrary model text. Handles
// markdown code fences and stray prose around the JSON. If the object is
// truncated (the model hit its output-token cap mid-response), repair the tail
// so the partial result still parses; normalizeExtraction then backfills any
// fields the truncation dropped. Returns null only when nothing usable is found.
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  // Strip a ```json ... ``` fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  // Walk braces to find the matching close, ignoring braces inside strings.
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
          // Balanced but still invalid: fall through to the repair path.
          break;
        }
      }
    }
  }

  // No balanced close (or it did not parse): the response was almost certainly
  // truncated. Repair the open tail and parse the salvageable prefix.
  return repairTruncatedJson(candidate.slice(start));
}

// Best-effort repair of a JSON object truncated mid-stream. Closes an open
// string, drops a dangling trailing key or comma, then closes every still-open
// array/object. Parses the most-complete prefix it can, trimming back element by
// element on failure. Returns null if nothing parses.
function repairTruncatedJson(s: string): unknown | null {
  const stack: string[] = []; // open "{" / "[" in order
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
  if (inString) body += '"'; // close an unterminated string value

  for (let attempt = 0; attempt < 200; attempt++) {
    // Drop a dangling trailing comma or an incomplete trailing "key": fragment.
    let trimmed = body.replace(/\s+$/, "");
    trimmed = trimmed.replace(/,\s*$/, "");
    // A trailing key with no value, e.g. ... "rationale": or ... "rationale"
    trimmed = trimmed.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
    const closed = trimmed + stack.slice().reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      return JSON.parse(closed);
    } catch {
      // Trim back to the previous element/property boundary and retry.
      const cut = Math.max(trimmed.lastIndexOf(","), trimmed.lastIndexOf("{"), trimmed.lastIndexOf("["));
      if (cut <= 0) return null;
      body = trimmed.slice(0, cut);
    }
  }
  return null;
}
