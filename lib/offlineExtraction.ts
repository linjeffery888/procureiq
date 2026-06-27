// Deterministic, no-network fallback for the extraction engine.
//
// The hero path calls Claude live. But a live present-back to an SVP cannot
// depend on a key being set, a network being up, or an API not rate-limiting
// at the worst moment. So when the live call is unavailable, this heuristic
// reads the same contract text with plain pattern matching and returns the
// same ContractExtraction shape. It is intentionally simpler than the model:
// it catches the headline deviations (sub-Net-30, vendor owns IP, uncapped
// liability, missing DPA, non-US law, short auto-renew) and marks anything it
// cannot read confidently as "review" so a human still looks. The UI always
// labels this as offline so we never imply the model did this work.

import { ContractExtraction, PlaybookFinding, Severity, ExtractedTerm, ParentReference, InstrumentType } from "./types";
import { PLAYBOOK, AMENDMENT_RULES, CONSISTENCY_CHECKS } from "./playbook";
import { ClauseThresholds, DEFAULT_THRESHOLDS } from "./clauseThresholds";

// A Contract No. token, e.g. IOV-MSA-2024-0142 or IOV-CO-2024-0142-02. Two
// letter/number groups, a 4-digit year, a sequence, and an optional child suffix.
const CONTRACT_ID = /[A-Z]{2,5}-[A-Z]{2,6}-\d{4}-\d{2,5}(?:-\d{1,3})?/;

// Spelled-out numbers that show up in contract language ("fifteen (15) days").
const WORD_NUMBERS: Record<string, number> = {
  fifteen: 15, thirty: 30, "forty-five": 45, forty: 40, sixty: 60, ninety: 90,
  "one hundred twenty": 120, twelve: 12, twenty: 20, "twenty-four": 24,
  "thirty-six": 36, "forty-eight": 48,
};

// The consistency checks declare flagIf, not an "acceptable" position, so give
// each a short standard line for the finding's `standard` field.
const CHECK_STANDARD: Record<string, string> = {
  invoice_schedule_math: "Schedule line amounts reconcile to the total work-order value.",
  key_dates: "Start, end, and effective dates are present, ordered, and not improperly backdated.",
  corporate_address: "The correct Iovance entity (Iovance Biotherapeutics, Inc.) and the precise vendor entity are named.",
};

// Synthetic findings the engine raises that do not map to a single playbook
// clause. Keyed the same way as a rule so finding() can resolve a label.
const SYNTHETIC_META: Record<string, { label: string; standard: string }> = {
  inherited_terms: {
    label: "Inherited terms (confirm parent)",
    standard:
      "A child instrument (SOW, change order) that omits the standard clauses inherits them from an on-file, current parent agreement.",
  },
};

// A finding can key off a clause rule (PLAYBOOK), an amendment rule, or a
// consistency check. Resolve the human label and the acceptable/standard line
// from whichever list owns the key so new keys (corporate_address, key_dates)
// do not throw.
function ruleMeta(key: string): { label: string; standard: string } {
  const p = PLAYBOOK.find((r) => r.key === key) ?? AMENDMENT_RULES.find((r) => r.key === key);
  if (p) return { label: p.label, standard: p.acceptable };
  const c = CONSISTENCY_CHECKS.find((r) => r.key === key);
  if (c) return { label: c.label, standard: CHECK_STANDARD[key] ?? c.whatToCheck };
  if (SYNTHETIC_META[key]) return SYNTHETIC_META[key];
  return { label: key, standard: "" };
}

function finding(
  key: string,
  found: string | null,
  severity: Severity,
  rationale: string,
  suggestedRedline = ""
): PlaybookFinding {
  const m = ruleMeta(key);
  return {
    termKey: key,
    label: m.label,
    found,
    standard: m.standard,
    severity,
    rationale,
    suggestedRedline: severity === "ok" ? "" : suggestedRedline,
  };
}

// Pull a day count from "Net 15", "Net sixty (60) days", "within fifteen (15) days".
function findPaymentDays(text: string): number | null {
  // The payment window is the day count anchored to the invoice or receipt date,
  // e.g. "within sixty (60) days of invoice date" or "Net 60 days from date of
  // invoice". Match the anchored parenthetical FIRST so an unrelated clause that
  // also counts days, such as a cure period, non-renewal notice, or licensing
  // true-up ("usage exceeding entitlements within thirty (30) days"), cannot be
  // mistaken for the payment term.
  const payParen = text.match(
    /(?:net|within)[^.\d(]{0,30}\((\d{1,3})\)\s*days?\s+(?:of|from|after|following)\s+(?:the\s+)?(?:receipt|invoice|date)/i,
  );
  if (payParen) return Number(payParen[1]);
  // Explicit "Net N" stated as the term (the renewal forms write "within Net 60
  // days", with no spelled-out parenthetical for the anchored matcher to catch).
  const net = text.match(/net\s*(\d{1,3})/i);
  if (net) return Number(net[1]);
  if (/due\s+(?:up)?on\s+receipt/i.test(text)) return 0;
  // Last resort: a bare "within (NN) days" with no invoice/receipt anchor.
  const paren = text.match(/(?:net|within)[^.\d(]{0,30}\((\d{1,3})\)\s*days?/i);
  if (paren) return Number(paren[1]);
  return null;
}

function findMonths(text: string): number | null {
  const paren = text.match(/(\d{1,3})\)\s*month/i);
  if (paren) return Number(paren[1]);
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`${word}\\s*\\(?\\d*\\)?\\s*month`, "i").test(text)) return n;
  }
  return null;
}

function findValue(text: string): number | null {
  // The contract value is the largest dollar figure that is NOT a
  // limitation-of-liability / indemnity cap. Without this guard, a $2,000,000
  // liability cap on a $180,000 subscription becomes totalValue — and totalValue
  // is the downstream budget anchor and the invoice match key, so the wrong
  // number propagates into BudgetIQ. Exclude any amount whose immediate lead-in
  // is liability-cap language, then take the largest of what remains.
  const CAP_LEADIN = /(liabilit|exceed|aggregate|ceiling|limited to|indemnif)/i;
  const re = /\$\s?([\d,]+(?:\.\d+)?)/g;
  const kept: number[] = [];
  const all: number[] = [];
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    all.push(n);
    const lead = text.slice(Math.max(0, (m.index ?? 0) - 80), m.index ?? 0);
    if (!CAP_LEADIN.test(lead)) kept.push(n);
  }
  if (kept.length) return Math.max(...kept);
  // Only liability-cap amounts present (no separate fee/value stated): fall back
  // to the largest figure rather than returning nothing.
  return all.length ? Math.max(...all) : null;
}

// The vendor is the counterparty, never Iovance. The parties block lists the
// vendor FIRST ("by and between: <Vendor>, a corporation ... ("Vendor"); and
// Iovance Biotherapeutics, Inc. ... ("Client")"), so capture the entity named
// before the first counterparty role tag and strip its trailing descriptor.
function stripDescriptor(name: string): string {
  // Cut "Acme, Inc., a corporation with its principal place of business..." down
  // to "Acme, Inc." and "Acme, L.P., with its principal place..." to "Acme, L.P."
  return tidy(name.split(/,\s+a(?:n)?\s+[a-z]|,\s+with\s+its\b/i)[0]);
}

function findVendor(text: string): string | null {
  // Preferred: the first party after "by and between", up to its role tag. The
  // vendor is always listed first; Iovance ("Client") follows.
  const tagged = text.match(
    /by and between:?\s+(.+?)\s*\(\s*["']?(?:Vendor|Supplier|Provider|Licensor|Consultant|Company)["']?\s*\)/i
  );
  if (tagged) {
    const name = stripDescriptor(tagged[1]);
    if (name && !/iovance/i.test(name)) return name;
  }
  // Fallback: the first party after "by and between", up to its descriptor.
  const between = text.match(/by and between:?\s+([A-Z][^()]+?)(?:,\s+a(?:n)?\s+[a-z]|,\s+with\s+its\b)/i);
  if (between && !/iovance/i.test(between[1])) return stripDescriptor(between[1]);
  // Last resort: any entity carrying a counterparty role tag, not Iovance.
  const anyTag = [...text.matchAll(/([A-Z][^()]{2,90}?)\s*\(\s*["']?(?:Vendor|Supplier|Provider|Licensor|Consultant)["']?\s*\)/g)];
  for (const m of anyTag) {
    const name = stripDescriptor(m[1]);
    if (name && !/iovance/i.test(name)) return name;
  }
  return null;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/[",]+$/, "").trim();
}

function findGoverningLaw(text: string): string | null {
  // Real clauses read "governed by and construed in accordance with the laws of
  // the State of Delaware", so allow the intervening "and construed..." phrase
  // and an optional "the State of" before the jurisdiction name.
  const m = text.match(
    /governed by[\s\S]{0,60}?the laws of(?:\s+the\s+(?:State|Commonwealth) of)?\s+([A-Za-z][A-Za-z ]+?)(?:[.,;]|\s+without\b|\s+and\b|$)/i
  );
  return m ? tidy(m[1]) : null;
}

// The 50 US states plus DC. Anything captured as the governing jurisdiction
// that is not on this list (and not the United States itself) is treated as a
// non-US jurisdiction, which Iovance escalates.
const US_STATES = new Set(
  [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
    "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
    "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
    "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
    "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
    "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "district of columbia",
  ].map((s) => s)
);

function isNonUsLaw(law: string | null): boolean {
  if (!law) return false;
  const norm = law.toLowerCase().trim();
  if (/united states|\bu\.?s\.?a?\b/.test(norm)) return false;
  return !US_STATES.has(norm);
}

// Does the vendor touch sensitive data? Drives the liability-cap expectation
// (a PHI/PII vendor needs a higher cap) and the DPA expectation.
function processesSensitiveData(text: string): boolean {
  return /\bphi\b|protected health information|personal data|personal information|patient (?:data|records|information)|\bpii\b/i.test(text);
}

// The limitation-of-liability region: the heading plus the clause body, or the
// neighbourhood of a liability-cap sentence. Scoping the read here is what keeps
// stray "without limitation" / "including but not limited to" boilerplate from
// elsewhere in the document out of the liability classification.
function liabilityRegion(text: string): string | null {
  const head = text.match(/LIMITATION OF LIABILITY[\s\S]{0,600}/i);
  if (head) return head[0];
  const sent = text.match(
    /[^.]*\b(?:cumulative liability|aggregate liability|total liability|liability (?:shall|is|of (?:either|vendor)))\b[\s\S]{0,320}/i
  );
  return sent ? sent[0] : null;
}

// The dollar cap stated inside a liability region ("...EXCEED $250,000").
function capDollars(region: string): number | null {
  const m = region.match(/(?:exceed|limited to|cap(?:ped)?\s*(?:at|of))\s*\$\s?([\d,]+)/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// True when the liability region affirmatively removes the cap. These are the
// generator's uncapped phrasings ("...LIABLE FOR ALL DAMAGES ... WITHOUT
// LIMITATION", "THERE SHALL BE NO LIMITATION ON EITHER PARTY'S LIABILITY").
function isUncappedLiability(region: string): boolean {
  return (
    /shall be liable for all damages/i.test(region) ||
    /there shall be no limitation on/i.test(region) ||
    /no limitation on (?:either party|the vendor|vendor['’]s|liability)/i.test(region) ||
    /liability (?:shall be|is) unlimited|unlimited liability/i.test(region) ||
    /shall not be (?:subject to any |in any way )?limit(?:ed)?\b/i.test(region) ||
    /no (?:monetary )?(?:cap|ceiling) (?:on|shall apply)/i.test(region)
  );
}

// A 12-months-of-fees cap, Iovance's preferred basis ("...SHALL NOT EXCEED THE
// TOTAL FEES PAID ... IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM").
function isTwelveMonthCap(region: string): boolean {
  return /fees paid[\s\S]{0,80}?(?:twelve|12)\s*\(?12?\)?\s*months|(?:twelve|12)\s*\(?12?\)?\s*months[\s\S]{0,40}?(?:preceding|prior)/i.test(region);
}

// IP ownership read. Returns the severity, the value, and (for deviations) the
// rationale/redline, or null when no ownership language is present.
function classifyIp(
  text: string
): { severity: Severity; found: string; rationale: string; redline: string } | null {
  // Vendor owns the deliverables it built for Iovance -> deviation.
  if (
    /(?:deliverables|work product)[\s\S]{0,220}?owned (?:exclusively )?by\s+vendor/i.test(text) ||
    /owned exclusively by vendor as vendor['’]?s/i.test(text) ||
    /(?:deliverables|work product)[\s\S]{0,180}?(?:sole property of|the property of)\s+vendor/i.test(text)
  ) {
    return {
      severity: "flag",
      found: "Vendor owns work product / deliverables",
      rationale:
        "Vendor claims ownership of deliverables created for Iovance. Iovance should own work product it pays to create so the vendor cannot resell it.",
      redline:
        "Assign ownership of all deliverables and work product to Iovance; vendor retains only its pre-existing IP.",
    };
  }
  // Iovance owns the deliverables, or keeps its data; vendor keeps pre-existing IP.
  if (
    /owned (?:exclusively )?by (?:the )?client/i.test(text) ||
    /assigns all (?:intellectual property )?rights[\s\S]{0,50}?to (?:the )?client/i.test(text) ||
    /work made for hire/i.test(text) ||
    /client (?:owns|retains) all right, title/i.test(text)
  ) {
    return {
      severity: "ok",
      found: "Iovance owns deliverables; vendor keeps pre-existing IP",
      rationale:
        "Iovance owns the deliverables it pays to create and retains its data; vendor keeps only pre-existing platform IP. Matches standard.",
      redline: "",
    };
  }
  // License posture: vendor retains its platform, no grab on Iovance deliverables.
  if (/vendor retains all right, title[\s\S]{0,140}?(?:pre-existing|its\s)/i.test(text)) {
    return {
      severity: "ok",
      found: "Vendor retains its platform IP; Iovance keeps its data",
      rationale:
        "Vendor retains rights to its pre-existing platform and Iovance keeps its data and configurations, the expected posture for a licensed platform.",
      redline: "",
    };
  }
  return null;
}

// The wrong-entity check. After the client unification every contract names the
// Iovance party as "Iovance Biotherapeutics, Inc."; the planted decoy names a
// different, wrong entity ("Iovance Biotherapeutics LLC", a Massachusetts LLC).
function namesWrongIovanceEntity(text: string): boolean {
  return (
    /iovance biotherapeutics\s+l\.?l\.?c\.?\b/i.test(text) ||
    /iovance[^.]{0,40}?massachusetts limited liability company/i.test(text)
  );
}

// The backdating check. Catches an effective date pushed before signing
// ("effective retroactively as of ...", "applied retroactively").
function isBackdated(text: string): boolean {
  return /applied retroactively|effective retroactively|retroactively (?:as of|to|effective)|retroactive effect|\bbackdated\b/i.test(text);
}

function classifyType(text: string): string | null {
  // Child instruments first. A change order or SOW names its parent's type ("...
  // issued under that certain Master Services Agreement..."), so checking the
  // parent types first would mislabel the child as an MSA. The child's own title
  // is the more specific, and correct, signal.
  if (/change order/i.test(text)) return "Amendment / Change Order";
  if (/\bthis (?:amendment|addendum)\b|amendment no\.|addendum no\./i.test(text)) return "Amendment / Change Order";
  if (/renewal agreement|software license renewal|this renewal/i.test(text)) return "Renewal";
  if (/master services agreement/i.test(text)) return "Master Services Agreement (MSA)";
  if (/software license|subscription agreement|saas/i.test(text)) return "Software / SaaS license";
  if (/statement of work|\bsow\b/i.test(text)) return "Statement of Work (SOW)";
  if (/non-?disclosure|confidentiality agreement|\bnda\b/i.test(text)) return "NDA";
  if (/consulting/i.test(text)) return "Consulting agreement";
  return null;
}

// True when the document is an amendment/change order/SOW/renewal that pulls its
// standard terms from a parent agreement by reference. For these, a standard
// clause that is simply absent here is governed by the parent, not a deviation,
// so we mark it "ok (inherited)" instead of asking a human to chase it down.
function incorporatesParent(text: string): boolean {
  // Only a genuine child instrument inherits. A base MSA, NDA, or SaaS license
  // stands on its own, so even though its body says "pursuant to this Agreement"
  // it must NOT be treated as inheriting (that would mask absent clauses as ok).
  const head = text.slice(0, 900);
  // Key off the document's OWN declared title ("This STATEMENT OF WORK (\"SOW\")
  // is entered into ..."), not a loose head scan. A child SOW routinely carries a
  // "REFERENCE TO MASTER SERVICES AGREEMENT" heading near the top, so testing for
  // the mere presence of "master services agreement" in the head would wrongly
  // disqualify it whenever that heading fell inside the scanned window.
  const titleMatch = head.match(
    /\bthis\s+([A-Za-z /&'-]{3,70}?)\s*(?:\(["'][^)]*["']\)\s*)?\bis\s+entered\s+into/i,
  );
  const selfTitle = (titleMatch ? titleMatch[1] : "").toLowerCase();
  const isBaseAgreement =
    /master services agreement|software license agreement|subscription agreement|non-?disclosure|confidentiality agreement|consulting agreement/.test(
      selfTitle,
    );
  const childByTitle = /statement of work|\bsow\b|change order|amendment|addendum|renewal/.test(selfTitle);
  const childByHead =
    /\b(change order|amendment no\.|addendum no\.|this amendment|this addendum)\b/i.test(head) ||
    /\brenewal agreement|software license renewal|this renewal\b/i.test(head);
  const isChild = !isBaseAgreement && (childByTitle || childByHead);
  if (!isChild) return false;
  const inherits =
    /incorporat\w*\s+by\s+reference/i.test(text) ||
    /that certain (?:master services agreement|\bmsa\b)/i.test(text) ||
    /\(the\s+["']MSA["']\)/i.test(text) ||
    /pursuant to[\s\S]{0,80}?(?:master services agreement|\bmsa\b|original\s+(?:sow|agreement))/i.test(text) ||
    /order of precedence/i.test(text) ||
    /(?:governed by|issued under|under) (?:that certain|the) (?:master services agreement|\bmsa\b|statement of work)/i.test(text) ||
    /all (?:other )?terms and conditions of the[\s\S]{0,90}?(?:remain|continue|shall remain)/i.test(text);
  return inherits;
}

// The parent agreement a child instrument cites. Returns null for a base
// agreement (an MSA/license/NDA that stands on its own). For a change order,
// SOW, addendum, or renewal it captures what the document SAYS its parent is:
// the parent's Contract No., title, date, and counterparty. The resolver, not
// this detector, decides whether that citation matches a known parent.
function findParentReference(text: string): ParentReference | null {
  let instrumentType: InstrumentType;
  if (/\b(change order|amendment|addendum)\b/i.test(text)) instrumentType = "amendment";
  else if (/\brenewal\b/i.test(text)) instrumentType = "renewal";
  else if (/statement of work|\bsow\b/i.test(text)) instrumentType = "sow";
  else return null; // a base agreement does not link up to a parent

  const titleM = text.match(
    /\b(Master Services Agreement|Statement of Work|Software License Agreement|License Agreement|Master Agreement|Original Agreement)\b/i
  );
  const parentTitle = titleM ? tidy(titleM[1]) : null;

  // Parent Contract No., cited right after a parent-agreement phrase.
  const idM = text.match(
    new RegExp(
      `(?:Master Services Agreement|Statement of Work|Software License Agreement|License Agreement|Master Agreement|Original Agreement|Agreement|MSA|SOW)\\s*(?:No\\.?|Number|#)\\s*(${CONTRACT_ID.source})`,
      "i"
    )
  );
  const parentContractId = idM ? idM[1].toUpperCase() : null;

  // Parent date: prefer one tied to the agreement phrase, else the first "dated".
  const datedNearAgreement = text.match(
    /(?:Agreement|MSA|SOW)[^.]{0,90}?dated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i
  );
  const anyDated = text.match(/dated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  const parentDate = (datedNearAgreement ?? anyDated)?.[1] ?? null;

  // The sentence the citation was read from, for the UI.
  const rawM = text.match(
    /[^.]*\b(?:issued under|pursuant to|amends|under and governed by|are parties to)\b[^.]*\./i
  );
  const rawReference = rawM ? tidy(rawM[0]) : null;

  return {
    isAmendment: true,
    instrumentType,
    parentContractId,
    parentTitle,
    parentDate,
    counterpartyEntity: findVendor(text),
    rawReference,
  };
}

// This document's OWN Contract No. (the identifier a base agreement prints, or
// the change-order number a child prints). When a child both prints its own id
// and cites the parent's, the own id is the first labeled id that is not the
// cited parent id.
function findContractId(text: string, parentId: string | null): string | null {
  const labeled = [
    ...text.matchAll(
      new RegExp(
        `\\b(?:Contract|Change Order|Agreement|SOW|Document)\\s*(?:No\\.?|Number|#|ID)\\s*[:#]?\\s*(${CONTRACT_ID.source})`,
        "gi"
      )
    ),
  ].map((m) => m[1].toUpperCase());
  for (const id of labeled) {
    if (id !== parentId) return id;
  }
  return labeled.length ? labeled[0] : null;
}

export function offlineExtraction(raw: string, thresholds: ClauseThresholds = DEFAULT_THRESHOLDS): ContractExtraction {
  // Real contracts wrap lines mid-clause, so collapse whitespace before
  // pattern matching. Every detector runs against this flattened text.
  const text = raw.replace(/\s+/g, " ").trim();

  const days = findPaymentDays(text);
  const months = findMonths(text);
  const value = findValue(text);
  const vendor = findVendor(text);
  const law = findGoverningLaw(text);
  const type = classifyType(text);

  // Affirmative auto-renewal only. A negated phrase such as "does not
  // automatically renew" or "no auto-renewal" is the clean position (no silent
  // renewal), so a negation sitting just before the renew phrase cancels it.
  const mentionsRenew = /automatically renew|auto-?renew/i.test(text);
  const negatedRenew = /\b(?:not|no|never|without|cannot|won['’]t|shall not|will not|does not|do not)\b[\s\w,()-]{0,20}?(?:automatically renew|auto-?renew)/i.test(text);
  const autoRenew = mentionsRenew && !negatedRenew;
  const autoRenewNoticeMatch = text.match(/renew[\s\S]{0,160}?\((\d{1,3})\)\s*days/i);
  const autoRenewNotice = autoRenewNoticeMatch ? Number(autoRenewNoticeMatch[1]) : null;

  // Contract linking: what parent (if any) this document cites, and its own id.
  const parentReference = findParentReference(text);
  const contractId = findContractId(text, parentReference?.parentContractId ?? null);

  // Amendments inherit absent standard clauses from their parent agreement, so
  // an absent clause here is "ok (inherited)" rather than something to chase.
  const inherited = incorporatesParent(text);
  const isNda = type === "NDA";
  const isRenewal = type === "Renewal";
  // Commercial / IP / data clauses an NDA does not carry: an NDA has no payment,
  // no deliverables to assign, no processing of Iovance data, and no convenience
  // exit, so their absence here is expected, not something a human must chase.
  const NDA_NOT_APPLICABLE = new Set([
    "net_payment_terms",
    "limitation_of_liability",
    "ip_ownership",
    "data_privacy",
    "termination",
  ]);
  // For a standard clause that is simply absent from THIS document: on an
  // inheriting amendment mark it ok (inherited); on an NDA mark the clauses an
  // NDA never carries ok (not applicable); otherwise ask a human to confirm.
  function absent(key: string, reviewRationale: string, reviewRedline = ""): PlaybookFinding {
    if (inherited) {
      inheritsAbsentClause = true;
      return finding(key, null, "ok", "Inherited from the parent agreement; not restated in this instrument.");
    }
    if (isNda && NDA_NOT_APPLICABLE.has(key)) {
      return finding(key, null, "ok", "Not applicable to a mutual NDA, which carries no commercial, IP, or data-processing terms.");
    }
    return finding(key, null, "review", reviewRationale, reviewRedline);
  }

  const findings: PlaybookFinding[] = [];
  // Set when a child instrument omits a standard clause and leans on its parent
  // for it. Drives a single "confirm the parent is on file" review note below.
  let inheritsAbsentClause = false;

  // 1. Net payment terms. Iovance asks for Net 60 as standard; Net 40 and Net 45
  // also clear, and anything longer is better for Iovance as the payer. Terms
  // SHORTER than Net 40 (Net 30, Net 15, due on receipt) are the vendor-favorable
  // deviation that strains cash timing, so they flag for the attorney to redline.
  const MIN_ACCEPTABLE_NET_DAYS = thresholds.minNetDays;
  if (days == null) {
    findings.push(absent("net_payment_terms", "No payment term detected in the text. Confirm the net terms manually."));
  } else if (days >= MIN_ACCEPTABLE_NET_DAYS) {
    findings.push(finding("net_payment_terms", `Net ${days}`, "ok", `Net ${days} meets Iovance's payment-term standard (at least Net ${MIN_ACCEPTABLE_NET_DAYS}; longer is better for the payer).`));
  } else if (days === 0) {
    findings.push(finding("net_payment_terms", "Due on receipt", "flag", `Payment due on receipt is far shorter than Iovance's Net ${MIN_ACCEPTABLE_NET_DAYS} standard and strains cash timing.`, "Push back toward Net 60 from receipt of an undisputed invoice."));
  } else {
    findings.push(finding("net_payment_terms", `Net ${days}`, "flag", `Net ${days} is shorter than Iovance's Net ${MIN_ACCEPTABLE_NET_DAYS} standard, the vendor-favorable deviation, and strains cash timing.`, "Push back toward Net 60 from receipt of an undisputed invoice."));
  }

  // 2. Limitation of liability. A cap that is present is acceptable (the higher
  // the better). The escalations are: liability that is affirmatively UNCAPPED,
  // and a thin dollar cap on a vendor that processes sensitive data (PHI/PII),
  // where Iovance expects a cap of a million or more.
  // A sensitive-data vendor capped below this is too thin (Iovance expects a
  // cap of a million or more for PHI/PII; a quarter-million is the planted
  // deviation, while a half-million-and-up cap is treated as acceptable).
  const PHI_CAP_FLOOR = thresholds.minLiabilityCap;
  const lolRegion = liabilityRegion(text);
  const processesPhi = processesSensitiveData(text);
  if (lolRegion && isUncappedLiability(lolRegion)) {
    findings.push(finding("limitation_of_liability", "Uncapped liability", "flag", "Liability is affirmatively uncapped. Iovance expects a cap, with carve-outs, so the vendor's exposure is bounded.", "Cap aggregate liability (12 months of fees or a fixed sum), with carve-outs for IP, confidentiality, and data breach."));
  } else if (lolRegion) {
    const cap = capDollars(lolRegion);
    if (cap != null && processesPhi && cap < PHI_CAP_FLOOR) {
      findings.push(finding("limitation_of_liability", `Capped at $${cap.toLocaleString("en-US")}, vendor handles sensitive data`, "flag", `The liability cap of $${cap.toLocaleString("en-US")} is thin for a vendor processing PHI/PII, where Iovance expects a cap of a million or more.`, "Raise the liability cap to at least $1,000,000 (or 12 months of fees if higher) given the data sensitivity, with carve-outs for data breach."));
    } else if (cap != null) {
      findings.push(finding("limitation_of_liability", `Capped at $${cap.toLocaleString("en-US")}`, "ok", `Liability is capped at $${cap.toLocaleString("en-US")}, an acceptable bounded cap.`));
    } else if (isTwelveMonthCap(lolRegion)) {
      findings.push(finding("limitation_of_liability", "Capped at 12 months of fees", "ok", "Liability cap matches Iovance's preferred 12-months-of-fees position."));
    } else {
      findings.push(finding("limitation_of_liability", "Cap present, basis unclear", "review", "A liability cap exists but the basis is not clearly stated. Confirm the cap amount and carve-outs."));
    }
  } else {
    findings.push(absent("limitation_of_liability", "No limitation-of-liability clause detected. Confirm a cap and carve-outs are present."));
  }

  // 3. IP ownership
  const ip = classifyIp(text);
  if (ip) {
    findings.push(finding("ip_ownership", ip.found, ip.severity, ip.rationale, ip.redline));
  } else {
    findings.push(absent("ip_ownership", "IP ownership not clearly stated. Confirm Iovance owns deliverables and the vendor retains only pre-existing IP."));
  }

  // 4. Confidentiality
  const confYears = text.match(/confidential[\s\S]{0,120}?(?:period of\s+)?(?:(\w+)\s*)?\((\d{1,2})\)\s*years?/i);
  if (confYears) {
    const yrs = Number(confYears[2]);
    const minConfYears = thresholds.minConfidentialityYears;
    if (yrs >= minConfYears) findings.push(finding("confidentiality", `Survives ${yrs} years`, "ok", `Confidentiality survives ${yrs} years, at or above the ${minConfYears}-year standard.`));
    else if (yrs >= minConfYears - 1) findings.push(finding("confidentiality", `Survives ${yrs} years`, "review", `Confidentiality survives only ${yrs} years; Iovance prefers ${minConfYears} or more.`, `Extend the confidentiality survival period to at least ${minConfYears} years post-termination.`));
    else findings.push(finding("confidentiality", `Survives ${yrs} year(s)`, "flag", `Confidentiality survives under ${minConfYears - 1} years.`, `Extend the confidentiality survival period to ${minConfYears} or more years post-termination.`));
  } else if (/confidential/i.test(text)) {
    findings.push(finding("confidentiality", "Present, survival period unclear", "review", "A confidentiality clause exists but the survival period is not clearly stated. Confirm mutual, 3 to 5 years."));
  } else {
    findings.push(absent("confidentiality", "No confidentiality clause detected. Confirm a mutual NDA with 3 to 5 year survival is present."));
  }

  // 5. Termination for convenience
  if (/terminate (?:this agreement )?for convenience/i.test(text)) {
    findings.push(finding("termination", "Termination for convenience present", "ok", "Iovance can exit for convenience, matching the standard."));
  } else if (isNda && /terminat/i.test(text)) {
    findings.push(finding("termination", "NDA term / return of information", "ok", "An NDA governs by its term and return-of-information obligations; a convenience-exit right is not expected here."));
  } else if (isRenewal && /terminat/i.test(text)) {
    findings.push(finding("termination", "Termination inherited from original agreement", "ok", "A renewal carries forward the termination provisions of the original agreement; the convenience-exit right, if any, lives in that agreement and is unchanged here."));
  } else if (/terminat/i.test(text)) {
    findings.push(finding("termination", "Termination for cause only", "review", "Only termination for breach/cause was detected, not termination for convenience. Confirm Iovance has a convenience exit.", "Add a termination-for-convenience right for Iovance with 30 to 90 days notice."));
  } else {
    findings.push(absent("termination", "No termination clause detected. Confirm Iovance has a termination-for-convenience right."));
  }

  // 6. Auto-renewal
  if (autoRenew && autoRenewNotice != null && autoRenewNotice < thresholds.minOptOutNoticeDays) {
    findings.push(finding("auto_renewal", `Auto-renews, ${autoRenewNotice} days opt-out notice`, "flag", `Auto-renews with only ${autoRenewNotice} days notice; Iovance needs ${thresholds.minOptOutNoticeDays}+ days to avoid silent renewals.`, `Require at least ${thresholds.minOptOutNoticeDays} days' opt-out notice before any auto-renewal, or remove auto-renewal.`));
  } else if (autoRenew) {
    findings.push(finding("auto_renewal", `Auto-renews, ${thresholds.minOptOutNoticeDays}+ days notice`, "ok", "Auto-renewal carries adequate opt-out notice."));
  } else if (inherited) {
    findings.push(finding("auto_renewal", null, "ok", "Inherited from the parent agreement; not restated in this amendment."));
  } else {
    findings.push(finding("auto_renewal", "No auto-renewal detected", "ok", "No auto-renewal clause detected, which matches Iovance's preference."));
  }

  // 7. Data privacy / DPA. The playbook escalates when sensitive data is
  // processed with no DPA, OR with a DPA that omits subprocessor disclosure or
  // breach recourse. So it is not enough that the words "data processing
  // agreement" appear: a section merely TITLED "Data Processing Agreement" that
  // promises "reasonable security measures" and nothing else is a stub, not an
  // enforceable DPA, and still escalates. An attached or incorporated DPA/BAA is
  // taken at face value; an in-body DPA is adequate only when it covers both
  // subprocessor disclosure and breach recourse.
  const processesPersonal =
    /personal data|\bphi\b|personal information|protected health information|patient (?:data|records|information)/i.test(text);
  const dpaMentioned =
    /data processing (?:agreement|addendum)|\bdpa\b|business associate (?:agreement|addendum)|\bbaa\b/i.test(text);
  const dpaExplicitlyAbsent =
    /no data processing (?:agreement|addendum)|no dpa\b|without a (?:dpa|data processing (?:agreement|addendum))/i.test(text);
  // A DPA carried by the PARENT agreement and kept in force by this renewal or
  // amendment is adequate by incorporation, even though the child does not
  // restate subprocessor or breach terms. The anchor is a DPA tied to the
  // "original" / "master" / "parent" agreement that "remains in full force",
  // "survives", or "applies". Note "attached hereto" / "herein" points at THIS
  // document, not a parent, so it does NOT count as incorporation, which keeps
  // a self-contained adversarial DPA (Stratos) on the substantive path below.
  const dpaIncorporatedFromParent =
    /(?:data processing (?:agreement|addendum)|\bdpa\b|business associate (?:agreement|addendum)|\bbaa\b)[^.]{0,160}?(?:original agreement|master (?:services )?agreement|parent agreement|underlying agreement)[^.]{0,80}?(?:remains?|continues?|in full force|in effect|survive|incorporat|applies)/i.test(text) ||
    /(?:original agreement|master (?:services )?agreement|parent agreement|underlying agreement)[^.]{0,120}?(?:data processing (?:agreement|addendum)|\bdpa\b)[^.]{0,80}?(?:remains?|continues?|in full force|in effect|survive|applies)/i.test(text) ||
    /(?:data processing (?:agreement|addendum)|\bdpa\b)[^.]{0,60}?attached to the original/i.test(text);
  // The two substantive elements the playbook calls out for a real in-body DPA.
  // Each must be an AFFIRMATIVE obligation. A clause that names subprocessors or
  // breach only to DISCLAIM the duty (e.g. "subprocessors at its sole
  // discretion, not required to disclose", or breach handling with "no
  // liability or remediation obligation") is worse than silence and must NOT
  // satisfy the check. We do not trust an "attached as Exhibit A / incorporated
  // by reference" phrase on its own: a stub can name an exhibit it never
  // substantiates. Every clean patient-data MSA in the corpus carries both
  // markers affirmatively in the body, so requiring them catches a hollow or
  // self-disclaiming DPA without false-positiving the clean set.
  // A real subprocessor clause is not just the noun: it must impose a
  // disclosure or flow-down obligation (a current list, notice/consent before
  // engaging, or binding subprocessors to the same data terms). A clause that
  // merely permits "subprocessors to assist in providing the Services" with no
  // obligation is a neutered subprocessor term and does NOT count.
  const dpaSubprocessor =
    /sub-?processors?[^.]{0,180}?(?:list of sub-?processors?|current list|available to (?:client|customer)|disclose|notify|inform|prior (?:written )?(?:notice|consent|approval)|bound by|subject to (?:the )?(?:same|equivalent|data protection)|flow[- ]?down|impose (?:the )?(?:same|equivalent))/i.test(text) ||
    /(?:disclose|notify|inform|provide (?:a )?(?:current )?list|maintain (?:a )?(?:current )?list)[^.]{0,90}?sub-?processors?/i.test(text) ||
    /onward transfer[^.]{0,60}?(?:notice|consent|disclos|bound)/i.test(text);
  const dpaSubprocessorDisclaimed =
    /sub-?processors?[^.]{0,140}?(?:at its sole discretion|not required to disclose|no obligation to disclose|not required to bind)/i.test(text) ||
    /not required to (?:disclose|bind)[^.]{0,60}?sub-?processor/i.test(text);
  const dpaBreachRecourse =
    /breach notif\w*|notif\w*[^.]{0,50}?(?:breach|incident)|security incident[^.]{0,50}?notif|data breach[^.]{0,50}?(?:notif|recourse|remed)|notify[^.]{0,50}?(?:breach|incident)/i.test(text);
  const dpaBreachDisclaimed =
    /(?:no liability|no remediation obligation|no obligation to (?:remediat|notif))[^.]{0,80}?(?:data breach|breach)/i.test(text) ||
    /data breach[^.]{0,120}?(?:no liability|no remediation obligation)/i.test(text);
  const dpaSubprocessorOk = dpaSubprocessor && !dpaSubprocessorDisclaimed;
  const dpaBreachOk = dpaBreachRecourse && !dpaBreachDisclaimed;
  const dpaAdequate =
    dpaMentioned && !dpaExplicitlyAbsent && dpaSubprocessorOk && dpaBreachOk;
  // Does THIS document set up its own data-processing terms, or does it only
  // touch personal data through a parent it incorporates? A change order or SOW
  // that names a "Patient Data Analytics Module" but carries no data clause of
  // its own relies on the parent MSA's DPA and should not be flagged. We treat
  // the document as having its own clause when it names a DPA/BAA, has a "DATA
  // PROCESSING" section heading, or affirmatively describes processing personal
  // data. This is what separates a renewal that drops in a fresh stub clause
  // (flag) from a change order that simply inherits the parent (ok).
  const ownDataClause =
    dpaMentioned ||
    /(?:^|\n)\s*\d*\.?\s*data processing\b/i.test(text) ||
    /process(?:es|ing|ed)?\s+(?:personal data|personal information|\bphi\b|protected health)/i.test(text) ||
    /(?:personal data|personal information|\bphi\b|protected health)[^.]{0,30}?\bprocess(?:es|ing|ed)?\b/i.test(text);

  if (!processesPersonal) {
    if (inherited) {
      findings.push(finding("data_privacy", null, "ok", "Inherited from the parent agreement; not restated in this amendment."));
    } else {
      findings.push(finding("data_privacy", "No personal data processing detected", "ok", "No personal-data processing detected; a DPA is not required on its face. Confirm scope."));
    }
  } else if (dpaIncorporatedFromParent) {
    findings.push(finding("data_privacy", "DPA incorporated from the original agreement", "ok", "The renewal keeps the parent agreement's Data Processing Agreement in full force, so the data terms carry forward. Confirm the parent DPA still meets standard."));
  } else if (dpaAdequate) {
    findings.push(finding("data_privacy", "Personal data processed, DPA present", "ok", "Personal data is processed under a DPA that covers security, subprocessor disclosure, and breach recourse, matching standard."));
  } else if (dpaMentioned && !dpaExplicitlyAbsent) {
    // A DPA section is present but hollow or self-disclaiming: a title plus
    // "reasonable security measures", or subprocessor/breach clauses that name
    // the duty only to waive it. Flag even on an inheriting child, because the
    // document is affirmatively setting an inadequate data term.
    const gaps: string[] = [];
    if (!dpaSubprocessorOk) gaps.push(dpaSubprocessorDisclaimed ? "binding subprocessor disclosure (the clause waives it)" : "subprocessor/subcontractor disclosure");
    if (!dpaBreachOk) gaps.push(dpaBreachDisclaimed ? "breach notification and recourse (the clause disclaims liability)" : "breach notification and recourse");
    const gapText = gaps.length ? gaps.join(" and ") : "the substantive processor obligations";
    findings.push(finding(
      "data_privacy",
      "DPA named but incomplete (stub)",
      "flag",
      `A data-processing section is present but omits ${gapText}. A heading plus "reasonable security measures" is a stub, not an enforceable DPA, so it escalates.`,
      "Replace the placeholder data-processing section with a full DPA covering security, subprocessor disclosure, and breach notification/recourse, or attach Iovance's standard DPA as an exhibit.",
    ));
  } else if (!ownDataClause && inherited) {
    // The document touches personal data only by naming a parent module or
    // service; it carries no data clause of its own and incorporates the parent
    // agreement, so the parent MSA's DPA governs. Not a gap on this document.
    findings.push(finding("data_privacy", null, "ok", "Inherited from the parent agreement; the parent carries the data-processing terms and this document adds none of its own."));
  } else {
    // Personal data, with the document setting up its own processing (or a
    // standalone agreement) yet no DPA section at all (or one explicitly
    // disclaimed) and nothing incorporated from a parent. Escalate even on an
    // amendment: a data-processing vendor needs a DPA somewhere, and this
    // document neither contains an adequate one nor references the parent's.
    findings.push(finding("data_privacy", "Personal data processed, no DPA/BAA", "flag", "The agreement processes personal data but references no DPA/BAA. This is a privacy and compliance gap.", "Attach a Data Processing Agreement (and BAA if PHI is involved) covering security, subprocessor disclosure, and breach notification before execution."));
  }

  // 8. Governing law
  if (isNonUsLaw(law)) {
    findings.push(finding("governing_law", law, "flag", `Governing law is ${law}, outside the US. Iovance prefers a US jurisdiction.`, "Change governing law and venue to Delaware or California."));
  } else if (law) {
    findings.push(finding("governing_law", law, "ok", `Governing law is ${law}, a US jurisdiction, matching standard.`));
  } else {
    findings.push(absent("governing_law", "No governing-law clause detected. Confirm a US jurisdiction governs the agreement."));
  }

  // 9. Corporate entity (consistency check). Surfaced only on a deviation: the
  // Iovance party should read "Iovance Biotherapeutics, Inc." Any other Iovance
  // entity (the planted "Iovance Biotherapeutics LLC") is the wrong signatory.
  if (namesWrongIovanceEntity(text)) {
    findings.push(finding("corporate_address", "Wrong Iovance entity named", "flag", "The agreement names an Iovance entity other than Iovance Biotherapeutics, Inc. (it reads as an LLC). The wrong contracting entity can void or misdirect the agreement.", "Correct the Iovance party to Iovance Biotherapeutics, Inc., the Delaware corporation, on every signature and notice block."));
  }

  // 10. Key dates (consistency check). Surfaced only on a deviation: an effective
  // date pushed before signing (a retroactive / backdated effective date).
  if (isBackdated(text)) {
    findings.push(finding("key_dates", "Backdated / retroactive effective date", "flag", "The effective date is set retroactively, before the signing date. A backdated effective date can change when obligations and payment begin and should be confirmed.", "Confirm with legal whether the retroactive effective date is intended and whether it affects payment timing; otherwise set the effective date to the signing date."));
  }

  // A child instrument that omits standard clauses needs no changes itself, but a
  // reviewer should confirm the parent agreement is on file and current before
  // approving. This is the routine "no change needed, but review just in case"
  // case, raised once per document rather than as a yellow row on each clause.
  if (inheritsAbsentClause) {
    findings.push(
      finding(
        "inherited_terms",
        "Standard clauses inherited from the parent agreement",
        "review",
        "This instrument carries its liability, IP, confidentiality, or data terms from its parent agreement rather than restating them. No change is needed here, but confirm the parent agreement is on file and its terms remain acceptable before approving.",
        "Verify the parent agreement is linked in the contract record and still current.",
      ),
    );
  }

  const terms: ExtractedTerm[] = [
    { key: "net_payment_terms", label: "Net payment terms", value: days == null ? null : days === 0 ? "Due on receipt" : `Net ${days}` },
    { key: "total_value", label: "Total contract value", value: value != null ? `$${value.toLocaleString("en-US")}` : null },
    { key: "term", label: "Term", value: months != null ? `${months} months` : null },
    { key: "governing_law", label: "Governing law", value: law },
  ];

  const flagCount = findings.filter((f) => f.severity === "flag").length;
  const reviewCount = findings.filter((f) => f.severity === "review").length;
  const paymentSchedule =
    days == null ? null : `Net ${days === 0 ? "0 (due on receipt)" : days}${value != null ? `, total $${value.toLocaleString("en-US")}` : ""}`;

  return {
    vendor,
    counterpartyType: type,
    totalValue: value,
    currency: value != null ? "USD" : null,
    startDate: null,
    endDate: null,
    termMonths: months,
    paymentSchedule,
    autoRenewal: autoRenew ? true : false,
    governingLaw: law,
    terms,
    findings,
    summary: `${type ?? "Contract"}${vendor ? ` with ${vendor}` : ""}${value != null ? `, value $${value.toLocaleString("en-US")}` : ""}. First-pass review found ${flagCount} item(s) to escalate and ${reviewCount} to confirm. An attorney confirms before execution.`,
    contractId,
    parentReference,
  };
}
