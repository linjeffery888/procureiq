// Iovance's standard-terms playbook. This is the finite checklist Ben
// described: "you would have a playbook for what we want to see... and if
// something is outside those parameters, bring it up for human review."
// Each entry is what the first-pass review checks. The acceptable position
// is what turns extraction into an auto-redline instead of a flag.
//
// Calibrated to Ben's second discovery call (DISCOVERY_INTERVIEW_2.md).
// The five clause rules below (net terms, LoL, IP, DPA, plus the general
// out-of-parameters catch) are now Ben-stated, not placeholders.
// Confidentiality, termination, auto-renewal, and governing law were NOT
// re-confirmed on that call; they are retained as reasonable defaults and
// tagged confirmed:false so the present-back does not present them as
// Iovance policy. Swap in real ranges once a fuller redlined sample arrives.
//
// A real redlined sample HAS arrived (Hexaware Change Order #1 to SOW #11,
// marked up by Iovance legal). It is an amendment, not a full MSA, so it does
// not contain net terms / LoL / IP / DPA ranges. What it teaches is the
// amendment layer (AMENDMENT_RULES below) and the date/entity checks
// (CONSISTENCY_CHECKS). See REDLINED_SAMPLE_ANALYSIS.md for the full read.

export interface PlaybookRule {
  key: string;
  label: string;
  whatToCheck: string;
  acceptable: string;       // the position Iovance wants
  escalateIf: string;       // when it must go to a human attorney
  confirmed: boolean;       // true when Ben stated it directly in discovery
}

export const PLAYBOOK: PlaybookRule[] = [
  {
    key: "net_payment_terms",
    label: "Net payment terms",
    whatToCheck: "Days to pay after invoice receipt.",
    acceptable: "Net 60. Iovance asks for Net 60 as standard.",
    escalateIf: "Net 30 or shorter, or due on receipt. Most vendors push Net 30, which is vendor-favorable and gets flagged.",
    confirmed: true,
  },
  {
    key: "limitation_of_liability",
    label: "Limitation of liability",
    whatToCheck: "Liability cap, and whether it scales with the sensitivity of the data the vendor processes.",
    acceptable: "A cap is present, the higher the better. For vendors processing PHI or PII, a higher cap (a million or more) is expected.",
    escalateIf: "Uncapped or no cap present, or a cap that looks low relative to the data sensitivity (for example a thin cap on a vendor handling PHI).",
    confirmed: true,
  },
  {
    key: "ip_ownership",
    label: "IP ownership",
    whatToCheck: "Who owns assets developed using the vendor's tools or services.",
    acceptable: "Iovance owns any asset built for it (for example Salesforce work built by a dev vendor), so the vendor cannot resell it to a competitor. Vendor keeps its pre-existing IP.",
    escalateIf: "Vendor retains ownership of deliverables built for Iovance, or claims rights to Iovance data.",
    confirmed: true,
  },
  {
    key: "data_privacy",
    label: "Data processing addendum (DPA)",
    whatToCheck: "For vendors that touch sensitive data: is there a DPA, and does it cover security, subcontractors, and breach recourse.",
    acceptable: "DPA in place: vendor secures data to Iovance standards (encryption, etc.), discloses any subcontractors or third parties that process the data, and defines Iovance's recourse on a breach.",
    escalateIf: "Sensitive data processed with no DPA, or a DPA missing subcontractor disclosure or breach recourse.",
    confirmed: true,
  },
  {
    key: "confidentiality",
    label: "Confidentiality",
    whatToCheck: "Mutual confidentiality and survival period.",
    acceptable: "Mutual NDA, survives 3 to 5 years post-termination.",
    escalateIf: "One-way only, or survival under 2 years, or absent.",
    confirmed: false,
  },
  {
    key: "termination",
    label: "Termination for convenience",
    whatToCheck: "Iovance's right to exit and notice period.",
    acceptable: "Termination for convenience with 30 to 90 days notice.",
    escalateIf: "No termination right, or penalty on exit.",
    confirmed: false,
  },
  {
    key: "auto_renewal",
    label: "Auto-renewal",
    whatToCheck: "Whether the contract renews automatically.",
    acceptable: "No auto-renewal, or auto-renew with 60+ days opt-out notice.",
    escalateIf: "Auto-renews with under 60 days notice or no opt-out.",
    confirmed: false,
  },
  {
    key: "governing_law",
    label: "Governing law",
    whatToCheck: "Jurisdiction governing the agreement.",
    acceptable: "Delaware, California, or other US state.",
    escalateIf: "Non-US governing law or venue.",
    confirmed: false,
  },
];

// Amendment-layer rules. These apply when the document is an amendment, change
// order, or renewal of a parent agreement rather than a standalone contract.
// Sourced from the real Iovance attorney redline (Hexaware Change Order #1 to
// SOW #11): each of these protective clauses was inserted by Iovance legal
// because the vendor draft omitted it. So for an amendment, a high-value part
// of the first pass is presence-checking these and tying the amendment to its
// parent, not negotiating commercial ranges (those live in the parent MSA).
// Tagged confirmed:false because they are observed from one redline, not stated
// by Ben as policy, but they are stronger than a guess.
export const AMENDMENT_RULES: PlaybookRule[] = [
  {
    key: "order_of_precedence",
    label: "Order of precedence",
    whatToCheck: "Whether the amendment states which terms control on conflict with the parent.",
    acceptable: "Explicit clause: on any inconsistency, this amendment controls over the original SOW or agreement.",
    escalateIf: "No precedence clause, so a conflict between the amendment and the parent is left ambiguous.",
    confirmed: false,
  },
  {
    key: "incorporation_by_reference",
    label: "Incorporation by reference",
    whatToCheck: "Whether the amendment ties back to and incorporates the governing master agreement and any addendum.",
    acceptable: "Amendment is made pursuant to and incorporates the named master agreement and its addendum by reference.",
    escalateIf: "Amendment does not reference its parent agreement, so the governing terms are unanchored.",
    confirmed: false,
  },
  {
    key: "entire_agreement",
    label: "Entire agreement and amendment in writing",
    whatToCheck: "Whether the document is the complete expression and can only be further amended in a signed writing, with unchanged parent terms preserved.",
    acceptable: "Entire-agreement clause present, plus survival of all unchanged parent terms in full force.",
    escalateIf: "No entire-agreement or no-oral-modification clause, or unchanged parent terms are not preserved.",
    confirmed: false,
  },
  {
    key: "authority_to_execute",
    label: "Authority to execute",
    whatToCheck: "Whether each party represents it has the power and authority to sign.",
    acceptable: "Mutual representation that each party has authority to execute and deliver the document.",
    escalateIf: "No authority representation present.",
    confirmed: false,
  },
];

// Validation checks beyond clause classification. Ben asked for these
// directly: simple arithmetic, date, and address sanity checks the first
// pass should run alongside the clause review. The invoice-schedule check
// also reinforces the shared spine: the extracted payment schedule must
// reconcile against the extracted total value.
export interface ConsistencyCheck {
  key: string;
  label: string;
  whatToCheck: string;
  flagIf: string;
}

export const CONSISTENCY_CHECKS: ConsistencyCheck[] = [
  {
    key: "invoice_schedule_math",
    label: "Invoice-schedule arithmetic",
    whatToCheck: "Whether an invoice or payment schedule is present and whether the line amounts sum to the total work-order value.",
    flagIf: "The schedule sums to more than the total work order, or the numbers do not add up.",
  },
  {
    key: "key_dates",
    label: "Key dates",
    whatToCheck: "Start, end, and effective dates are present and sane, including any retroactive or backdated effective date.",
    flagIf: "An end date precedes a start date, dates are missing or malformed, or an effective date is backdated well before the signing date (a long retroactive period). In a real Iovance redline the attorney flagged a change order signed in April 2026 that backdated obligations to April 2025 and asked whether it affects payment; surface that same question.",
  },
  {
    key: "corporate_address",
    label: "Corporate entity and address",
    whatToCheck: "The legal entity names and addresses are correct on both sides: the right Iovance entity, and the right vendor entity including any affiliate.",
    flagIf: "The wrong entity name, a wrong or stale corporate address, or an imprecise vendor entity appears (for example naming the parent but not the contracting affiliate, or Limited where Inc. signs).",
  },
];

// Compact string the LLM can read to do the first-pass review.
export function playbookForPrompt(): string {
  const fmtRule = (r: PlaybookRule) =>
    `- ${r.label} (${r.key}): check ${r.whatToCheck} Acceptable: ${r.acceptable} Escalate if: ${r.escalateIf}`;
  const clauses = PLAYBOOK.map(fmtRule).join("\n");
  const amendments = AMENDMENT_RULES.map(fmtRule).join("\n");
  const checks = CONSISTENCY_CHECKS.map(
    (c) => `- ${c.label} (${c.key}): check ${c.whatToCheck} Flag if: ${c.flagIf}`
  ).join("\n");
  return (
    `Clause review:\n${clauses}\n\n` +
    `If the document is an amendment, change order, or renewal of a parent ` +
    `agreement, also run these amendment checks (commercial terms are ` +
    `inherited from the parent and need not be restated here):\n${amendments}\n\n` +
    `Consistency checks:\n${checks}`
  );
}
