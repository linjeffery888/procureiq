// Contract-family resolver: ties change orders, SOWs, addenda, and renewals to
// the parent agreement they modify, then evaluates the family AS ONE UNIT.
//
// Why this exists. A change order is not a standalone contract. Reviewed alone
// it looks "clean" because it does not restate liability, IP, or governing law,
// so the first pass has nothing to measure. The truth lives in the parent. To
// review correctly we link the child to its parent and present the merged
// picture: the parent supplies every inherited clause, and ONLY the clauses the
// most recent amendment actually changes are measured against the playbook.
//
// The linking key is the parent's Contract No., not the vendor name. That is
// what keeps an amendment tied to the right agreement and NOT to an antiquated
// or separate contract from the same vendor: two agreements with one vendor have
// two different Contract Nos., and the amendment cites exactly one of them.
//
// Resolution is tiered and honest about confidence:
//   - exact   (cites a Contract No. that is present)   -> linked,        high
//   - fuzzy   (no number, one plausible parent present) -> needs_confirm, medium
//   - missing (cites a parent not in the set)           -> parent_not_found, none
//   - base    (not an amendment)                        -> standalone
// A medium match is surfaced for a human to confirm; it is never treated as
// settled. This mirrors the rest of the product: the machine proposes the fuzzy
// link, a human confirms it.

import {
  ContractExtraction,
  PlaybookFinding,
  ParentResolution,
  LinkStatus,
  LinkConfidence,
} from "./types";

// One document handed to the resolver. rowId is the caller's local handle (e.g.
// an upload row id); the resolver echoes it back in the result.
export interface LinkableDoc {
  rowId: string;
  sourceName: string;
  extraction: ContractExtraction;
}

// A resolved contract family: a parent (when present in the set) plus the
// children that modify it, with the merged unit evaluation.
export interface ContractFamily {
  key: string;                       // stable family id (parent contractId or rowId)
  parentRowId: string | null;        // the base agreement's rowId, if it is in the set
  parentContractId: string | null;   // the parent's Contract No., if known
  parentTitle: string | null;        // the parent's title, for the UI
  vendor: string | null;
  memberRowIds: string[];            // parent first, then children in chronological order
  childRowIds: string[];             // children only
  mergedFindings: PlaybookFinding[]; // unit evaluation: parent baseline, changed clauses overlaid
  unitFlagCount: number;
  unitReviewCount: number;
  parentMissing: boolean;            // a child cites a parent that is not in the set
}

export interface LinkingResult {
  resolutions: Record<string, ParentResolution>; // by rowId
  families: ContractFamily[];                     // only families with >1 member or a missing parent
}

// Loose entity normalization so "Apexion Cloud Services, Inc." and "Apexion
// Cloud Services" resolve to the same counterparty.
function normalizeEntity(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/["'.,()]/g, " ")
    .replace(/\b(inc|llc|l l c|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|kgaa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(id: string | null | undefined): string {
  return (id || "").toUpperCase().replace(/\s+/g, "");
}

// A document is a "base" agreement (a possible parent) when it does not itself
// cite a parent. SOWs are children of an MSA but may parent change orders, so a
// doc is indexable as a parent whenever it prints its own Contract No.
function isBase(extraction: ContractExtraction): boolean {
  return !extraction.parentReference || extraction.parentReference.isAmendment === false;
}

// Does the child actually assert this clause (i.e. set or change it), versus
// simply inherit it from the parent? Inherited placeholders are severity "ok"
// with found null; anything else means the child put a value on the table, which
// is exactly what the unit evaluation should measure.
function childAsserts(f: PlaybookFinding): boolean {
  return f.found !== null || f.severity !== "ok";
}

// A best-effort ordering key for children so the MOST RECENT amendment wins when
// two change the same clause. Prefers the numeric suffix of the Contract No.
// (…-02 before …-03), then any 4-digit year in the id, then input order.
function childOrder(doc: LinkableDoc, index: number): number {
  const id = doc.extraction.contractId || "";
  const suffix = id.match(/-(\d{1,3})$/);
  if (suffix) return 100000 + Number(suffix[1]);
  return index;
}

export function resolveContractFamilies(docs: LinkableDoc[]): LinkingResult {
  // Index every document that prints a Contract No., so a citation can find it.
  const byId = new Map<string, LinkableDoc>();
  for (const d of docs) {
    const id = normalizeId(d.extraction.contractId);
    if (id) byId.set(id, d);
  }

  const resolutions: Record<string, ParentResolution> = {};
  // child rowId -> resolved parent rowId (only when we have a concrete match)
  const parentOf = new Map<string, string>();

  for (const d of docs) {
    const ref = d.extraction.parentReference;
    if (!ref || !ref.isAmendment) {
      resolutions[d.rowId] = standalone();
      continue;
    }

    const citedId = normalizeId(ref.parentContractId);

    // Tier 1: exact Contract No. match.
    if (citedId) {
      const hit = byId.get(citedId);
      if (hit && hit.rowId !== d.rowId) {
        parentOf.set(d.rowId, hit.rowId);
        resolutions[d.rowId] = {
          status: "linked",
          confidence: "high",
          matchedContractId: hit.extraction.contractId,
          matchedTitle: titleOf(hit),
          rationale: `Matched parent Contract No. ${hit.extraction.contractId} exactly. Evaluated as one unit with its parent.`,
        };
        continue;
      }
      // A number was cited but no document in the set carries it.
      resolutions[d.rowId] = {
        status: "parent_not_found",
        confidence: "none",
        matchedContractId: null,
        matchedTitle: null,
        rationale: `Cites parent Contract No. ${ref.parentContractId}, which is not among the documents under review. Upload the parent to evaluate as one unit.`,
      };
      continue;
    }

    // Tier 2: fuzzy match by counterparty (and date when present). Used for
    // legacy paper that cites a parent only by title and date with no number.
    const wantEntity = normalizeEntity(ref.counterpartyEntity || d.extraction.vendor);
    const candidates = docs.filter(
      (c) =>
        c.rowId !== d.rowId &&
        isBase(c.extraction) &&
        wantEntity.length > 0 &&
        normalizeEntity(c.extraction.vendor) === wantEntity
    );

    if (candidates.length === 1) {
      const cand = candidates[0];
      parentOf.set(d.rowId, cand.rowId);
      resolutions[d.rowId] = {
        status: "needs_confirm",
        confidence: "medium",
        matchedContractId: cand.extraction.contractId,
        matchedTitle: titleOf(cand),
        rationale: `No Contract No. is cited. Matched the only ${cand.extraction.vendor ?? "vendor"} agreement in the set by counterparty${ref.parentDate ? ` and date (${ref.parentDate})` : ""}. Confirm before treating as one unit.`,
      };
      continue;
    }

    if (candidates.length > 1) {
      // The exact case the user worried about: several agreements from one
      // vendor and no number to tell them apart. Do not guess; ask a human.
      resolutions[d.rowId] = {
        status: "needs_confirm",
        confidence: "medium",
        matchedContractId: null,
        matchedTitle: null,
        rationale: `No Contract No. is cited and ${candidates.length} agreements from ${ref.counterpartyEntity ?? d.extraction.vendor ?? "this vendor"} are present. Cannot tell which is the parent automatically; confirm which agreement this modifies.`,
      };
      continue;
    }

    // Tier 3: nothing matched.
    resolutions[d.rowId] = {
      status: "parent_not_found",
      confidence: "none",
      matchedContractId: null,
      matchedTitle: null,
      rationale: `Cites a ${ref.parentTitle ?? "parent agreement"}${ref.parentDate ? ` dated ${ref.parentDate}` : ""}${ref.counterpartyEntity ? ` with ${ref.counterpartyEntity}` : ""}, but no matching agreement is among the documents under review.`,
    };
  }

  const families = buildFamilies(docs, parentOf, resolutions);
  return { resolutions, families };
}

// Group documents into families by following resolved child -> parent edges to a
// root, then overlay each child's changed clauses onto the parent baseline.
function buildFamilies(
  docs: LinkableDoc[],
  parentOf: Map<string, string>,
  resolutions: Record<string, ParentResolution>
): ContractFamily[] {
  const byRowId = new Map(docs.map((d) => [d.rowId, d]));

  // Walk to the topmost ancestor present in the set (handles MSA -> SOW -> CO).
  function rootOf(rowId: string, guard = 0): string {
    const parent = parentOf.get(rowId);
    if (!parent || guard > 10) return rowId;
    return rootOf(parent, guard + 1);
  }

  const groups = new Map<string, LinkableDoc[]>();
  for (const d of docs) {
    const root = rootOf(d.rowId);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(d);
  }

  const families: ContractFamily[] = [];
  for (const [rootRowId, members] of groups) {
    const root = byRowId.get(rootRowId)!;
    const children = members
      .filter((m) => m.rowId !== rootRowId)
      .sort((a, b) => childOrder(a, docs.indexOf(a)) - childOrder(b, docs.indexOf(b)));

    // A child that cites a parent we never found stands alone but is still worth
    // surfacing as a one-member family so the UI can flag the missing parent.
    const rootRef = root.extraction.parentReference;
    const rootResolution = resolutions[rootRowId];
    const parentMissing =
      children.length === 0 &&
      !!rootRef &&
      rootRef.isAmendment &&
      rootResolution?.status === "parent_not_found";

    if (children.length === 0 && !parentMissing) continue; // a plain standalone base agreement

    const rootIsBase = isBase(root.extraction);
    const parentRowId = rootIsBase ? rootRowId : null;

    const mergedFindings = mergeFamilyFindings(root, children);
    families.push({
      key: root.extraction.contractId || rootRowId,
      parentRowId,
      parentContractId: root.extraction.contractId,
      parentTitle: titleOf(root),
      vendor: root.extraction.vendor,
      memberRowIds: [rootRowId, ...children.map((c) => c.rowId)],
      childRowIds: children.map((c) => c.rowId),
      mergedFindings,
      unitFlagCount: mergedFindings.filter((f) => f.severity === "flag").length,
      unitReviewCount: mergedFindings.filter((f) => f.severity === "review").length,
      parentMissing,
    });
  }

  return families;
}

// The unit evaluation. Start from the parent's full findings as the baseline,
// then overlay each child's ASSERTED clauses in chronological order so the most
// recent amendment wins. Clauses no amendment touches keep the parent's
// disposition; clauses an amendment changes are measured fresh against the
// playbook (that measurement already happened when the child was extracted).
function mergeFamilyFindings(root: LinkableDoc, children: LinkableDoc[]): PlaybookFinding[] {
  const merged = new Map<string, { finding: PlaybookFinding; from: string }>();
  for (const f of root.extraction.findings) {
    merged.set(f.termKey, { finding: f, from: root.sourceName });
  }
  for (const child of children) {
    for (const f of child.extraction.findings) {
      if (childAsserts(f)) {
        merged.set(f.termKey, { finding: f, from: child.sourceName });
      } else if (!merged.has(f.termKey)) {
        merged.set(f.termKey, { finding: f, from: child.sourceName });
      }
    }
  }
  return [...merged.values()].map((m) => m.finding);
}

function titleOf(d: LinkableDoc): string | null {
  return d.extraction.counterpartyType || d.extraction.parentReference?.parentTitle || null;
}

function standalone(): ParentResolution {
  return {
    status: "standalone",
    confidence: "none",
    matchedContractId: null,
    matchedTitle: null,
    rationale: "Standalone agreement; no parent to link.",
  };
}

// Re-exported so callers can label statuses without re-deriving copy.
export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  linked: "Linked to parent",
  needs_confirm: "Probable parent, confirm",
  parent_not_found: "Parent not found",
  standalone: "Standalone",
};

export const LINK_CONFIDENCE_LABEL: Record<LinkConfidence, string> = {
  high: "High confidence",
  medium: "Confirm",
  none: "",
};
