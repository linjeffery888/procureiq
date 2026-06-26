// The editable clause thresholds: the numeric knobs the deterministic engine
// compares contracts against. These used to be hardcoded constants buried in
// lib/offlineExtraction (MIN_ACCEPTABLE_NET_DAYS, PHI_CAP_FLOOR, the
// confidentiality-year bands, the auto-renewal notice floor). Lifting them into
// one typed config makes them visible and adjustable from the Knowledge corpus,
// and lets one edit flow downstream two ways:
//
//   1. Future contracts: offlineExtraction reads these thresholds, so every new
//      upload is judged against the current numbers.
//   2. Existing precedents: classifyClauseByThreshold re-labels the corpus, so
//      raising or lowering a threshold re-colors which on-file precedents read as
//      pass vs flag.
//
// Only clauses with a genuine numeric boundary live here. Presence/category
// clauses (IP ownership, termination-for-convenience, DPA, governing law) are
// yes/no rules with nothing to tune, so they are surfaced as read-only context
// in the editor, not as knobs.
//
// This module is pure and has NO server (fs) dependency and NO import from
// offlineExtraction, so it is safe to import from both the server store and the
// client editor. The parsers below are intentionally small and mirror the
// extractor's reading of the same clause text.

import { CorpusLabel } from "./types";

export interface ClauseThresholds {
  // net_payment_terms: payment windows SHORTER than this many days are the
  // vendor-favorable deviation that strains cash timing, so they flag.
  minNetDays: number;
  // limitation_of_liability: a dollar cap BELOW this floor is too thin (and for a
  // vendor processing PHI/PII, Iovance expects a cap at least this high). Uncapped
  // liability always flags regardless of this number.
  minLiabilityCap: number;
  // confidentiality: survival shorter than this many years is below standard. One
  // year under the floor reads as a softer "review"; further below reads as flag.
  minConfidentialityYears: number;
  // auto_renewal: an opt-out notice window SHORTER than this many days risks a
  // silent renewal, so it flags. A perpetual renewal or a waived exit always flags.
  minOptOutNoticeDays: number;
}

// The shipped defaults. These reproduce the labels the corpus and the extractor
// carried before the thresholds were made editable, so "reset to defaults"
// returns the engine to its known-good baseline.
export const DEFAULT_THRESHOLDS: ClauseThresholds = {
  minNetDays: 40,
  minLiabilityCap: 500_000,
  minConfidentialityYears: 3,
  minOptOutNoticeDays: 60,
};

// Coerce an arbitrary object into a valid ClauseThresholds, clamping each field
// to a sane range and falling back to the default when a value is missing or not
// a finite number. Used by the store (on read) and the API (on write) so a bad
// payload can never corrupt the engine.
export function coerceThresholds(input: any): ClauseThresholds {
  const num = (v: any, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    minNetDays: num(input?.minNetDays, DEFAULT_THRESHOLDS.minNetDays, 0, 365),
    minLiabilityCap: num(input?.minLiabilityCap, DEFAULT_THRESHOLDS.minLiabilityCap, 0, 100_000_000),
    minConfidentialityYears: num(input?.minConfidentialityYears, DEFAULT_THRESHOLDS.minConfidentialityYears, 0, 20),
    minOptOutNoticeDays: num(input?.minOptOutNoticeDays, DEFAULT_THRESHOLDS.minOptOutNoticeDays, 0, 365),
  };
}

// ---------------------------------------------------------------------------
// UI metadata. Drives the editor block on the Knowledge page: which knobs to
// render, their clause, unit, range, and the plain-language rule. Keeping this
// next to the config means the editor never drifts from the thresholds it edits.
// ---------------------------------------------------------------------------

export type ThresholdKey = keyof ClauseThresholds;

export interface ThresholdField {
  key: ThresholdKey;
  clauseTag: string;
  clauseLabel: string;
  unit: string;            // "days", "USD", "years"
  label: string;           // the knob label
  min: number;
  max: number;
  step: number;
  // Renders the live rule, e.g. "Flag payment terms shorter than Net 40."
  rule: (v: number) => string;
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export const THRESHOLD_FIELDS: ThresholdField[] = [
  {
    key: "minNetDays",
    clauseTag: "net_payment_terms",
    clauseLabel: "Net payment terms",
    unit: "days",
    label: "Minimum acceptable payment window",
    min: 0,
    max: 180,
    step: 5,
    rule: (v) => `Flag payment terms shorter than Net ${v}; Net ${v} or longer passes.`,
  },
  {
    key: "minLiabilityCap",
    clauseTag: "limitation_of_liability",
    clauseLabel: "Limitation of liability",
    unit: "USD",
    label: "Minimum acceptable liability cap",
    min: 0,
    max: 5_000_000,
    step: 50_000,
    rule: (v) => `Flag a liability cap below ${usd(v)} (and any uncapped liability); ${usd(v)} or higher passes.`,
  },
  {
    key: "minConfidentialityYears",
    clauseTag: "confidentiality",
    clauseLabel: "Confidentiality survival",
    unit: "years",
    label: "Minimum confidentiality survival",
    min: 0,
    max: 10,
    step: 1,
    rule: (v) => `Flag confidentiality surviving under ${Math.max(0, v - 1)} years; ${v}+ years passes, ${Math.max(0, v - 1)} years is a review.`,
  },
  {
    key: "minOptOutNoticeDays",
    clauseTag: "auto_renewal",
    clauseLabel: "Auto-renewal opt-out notice",
    unit: "days",
    label: "Minimum auto-renewal opt-out notice",
    min: 0,
    max: 180,
    step: 5,
    rule: (v) => `Flag an auto-renewal with under ${v} days opt-out notice (or none); ${v}+ days passes.`,
  },
];

// Presence/category rules shown read-only beside the editable knobs, so the
// reviewer sees the whole rule set, not just the tunable numbers.
export interface PresenceRule {
  clauseTag: string;
  clauseLabel: string;
  rule: string;
}

export const PRESENCE_RULES: PresenceRule[] = [
  { clauseTag: "ip_ownership", clauseLabel: "IP ownership", rule: "Pass when Iovance owns the deliverables it pays to create and the vendor keeps only its pre-existing IP; flag when the vendor claims the work product." },
  { clauseTag: "termination", clauseLabel: "Termination for convenience", rule: "Pass when Iovance has a termination-for-convenience right; review when only termination for cause is present." },
  { clauseTag: "data_privacy", clauseLabel: "Data processing addendum", rule: "Flag when personal data is processed with no DPA/BAA referenced; pass when a DPA is in place or no personal data is processed." },
  { clauseTag: "governing_law", clauseLabel: "Governing law", rule: "Pass for a US jurisdiction (Delaware, California, or another US state); flag for a non-US governing law." },
];

// ---------------------------------------------------------------------------
// Small, self-contained parsers. These read the same clause text the extractor
// reads, but only the slice each threshold needs. They run over the precedent
// snippets (clean, single-clause) and over uploaded contract text alike.
// ---------------------------------------------------------------------------

// Lowest payment-day window stated in the text, or null if none is stated.
// "Due on receipt" counts as 0. Spelled forms always carry a parenthetical digit
// in this corpus ("sixty (60) days"), so the digit matchers catch them.
export function parseNetDays(text: string): number | null {
  const found: number[] = [];
  if (/due\s+(?:up)?on\s+receipt/i.test(text)) found.push(0);
  for (const m of text.matchAll(/net\s*(\d{1,3})/gi)) found.push(Number(m[1]));
  for (const m of text.matchAll(/\((\d{1,3})\)\s*days?/gi)) found.push(Number(m[1]));
  const valid = found.filter((n) => Number.isFinite(n));
  return valid.length ? Math.min(...valid) : null;
}

// Whether the liability clause affirmatively disclaims any cap.
export function isUncapped(text: string): boolean {
  return (
    /no\s+limitation\s+on\s+(?:either\s+party'?s?\s+)?liability/i.test(text) ||
    /no\s+monetary\s+cap/i.test(text) ||
    /shall\s+not\s+be\s+limited/i.test(text) ||
    /liable\s+for\s+all\s+damages[\s\S]*?without\s+limitation/i.test(text)
  );
}

// The largest dollar figure in the text, taken as the liability cap, or null.
export function parseLiabilityCap(text: string): number | null {
  const nums = [...text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

// Confidentiality survival in years, or null if no year count is stated. The
// corpus confidentiality snippets state obligations without a year, so this
// returns null for them (they keep their seeded label).
export function parseConfidentialityYears(text: string): number | null {
  const m = text.match(/confidential[\s\S]{0,160}?\((\d{1,2})\)\s*years?/i) || text.match(/\((\d{1,2})\)\s*years?/i);
  return m ? Number(m[1]) : null;
}

// Whether the renewal is perpetual or waives the exit right; either makes it an
// automatic flag regardless of the notice window.
export function isPerpetualRenewal(text: string): boolean {
  return /perpetual/i.test(text) || /waive[sd]?\s+any\s+right\s+to\s+terminate/i.test(text);
}

// Opt-out / non-renewal notice window in days, or null if the clause auto-renews
// with no stated opt-out. Returns null when the text is not an auto-renewal.
export function parseAutoRenewal(text: string): { isAuto: boolean; noticeDays: number | null } {
  const isAuto = /automatically(?:\s+and\s+perpetually)?\s+renew/i.test(text) || /auto-?renew/i.test(text);
  if (!isAuto) return { isAuto: false, noticeDays: null };
  const m =
    text.match(/notice\s+of\s+non-?renewal\s+at\s+least\s+(?:[\w-]+\s+)?\((\d{1,3})\)\s*days?/i) ||
    text.match(/at\s+least\s+(?:[\w-]+\s+)?\((\d{1,3})\)\s*days?\s+prior/i) ||
    text.match(/\((\d{1,3})\)\s*days?\s+prior/i);
  return { isAuto: true, noticeDays: m ? Number(m[1]) : null };
}

// ---------------------------------------------------------------------------
// The evaluator. Given a clause tag, its text, and the current thresholds,
// return the label the threshold implies, or null when this clause has no
// numeric threshold (or the value cannot be read from the text), in which case
// the caller leaves the existing label untouched.
// ---------------------------------------------------------------------------

export function classifyClauseByThreshold(
  clauseTag: string | null,
  text: string,
  thresholds: ClauseThresholds,
): CorpusLabel | null {
  if (!clauseTag || !text) return null;

  if (clauseTag === "net_payment_terms") {
    const days = parseNetDays(text);
    if (days == null) return null;
    return days < thresholds.minNetDays ? "flag" : "pass";
  }

  if (clauseTag === "limitation_of_liability") {
    if (isUncapped(text)) return "flag";
    const cap = parseLiabilityCap(text);
    if (cap == null) return null;
    return cap < thresholds.minLiabilityCap ? "flag" : "pass";
  }

  if (clauseTag === "confidentiality") {
    const yrs = parseConfidentialityYears(text);
    if (yrs == null) return null;
    return yrs >= thresholds.minConfidentialityYears ? "pass" : "flag";
  }

  if (clauseTag === "auto_renewal") {
    const { isAuto, noticeDays } = parseAutoRenewal(text);
    if (!isAuto) return null;
    if (isPerpetualRenewal(text)) return "flag";
    if (noticeDays == null) return "flag";
    return noticeDays < thresholds.minOptOutNoticeDays ? "flag" : "pass";
  }

  return null;
}
