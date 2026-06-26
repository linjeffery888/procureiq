"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CorpusLabel, CorpusStatus, RetrievedPrecedent } from "@/lib/types";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { UploadProgress } from "../components/UploadProgress";
import {
  ClauseThresholds,
  ThresholdKey,
  DEFAULT_THRESHOLDS,
  THRESHOLD_FIELDS,
  PRESENCE_RULES,
} from "@/lib/clauseThresholds";
import { logAudit } from "@/lib/auditClient";
import { useReviewer } from "../components/reviewer";

// The Knowledge module, ported to the approved comp: the precedent corpus that
// grounds ContractIQ. It shows the index status, ingests new precedents from
// uploaded files (real text extraction), lets the attorney label each precedent
// pass / flag, previews retrieval for a query, and reports a leave-one-out
// accuracy. The auditable boundary, stated on screen: retrieval is EVIDENCE
// only. The deterministic playbook still owns every pass/flag decision; the
// accuracy number measures retrieval as a grounding signal, not the flag.

type DocRow = {
  id: string;
  title: string;
  vendor: string | null;
  docType: string | null;
  label: CorpusLabel;
  clauseTag: string | null;
  note: string;
  addedAt: string;
  text: string;
  clauseExcerpt: string; // this contract's own verbatim clause line, from the API
};

type EvalResult = {
  evaluated: number;
  correct: number;
  accuracy: number;
  perLabel: { label: CorpusLabel; evaluated: number; correct: number }[];
  note: string;
};

// A grounded suggestion the classify endpoint returns for a new doc.
type ClassifySuggestion = {
  clauseTag: string | null;
  suggestedLabel: CorpusLabel;
  confidence: number;
  basis: string;
  clauseExcerpt: string;
  precedentTitle: string;
  precedentLabel: CorpusLabel | null;
  precedentExcerpt: string;
  neighbors: RetrievedPrecedent[];
  duplicateOf: string | null; // title of a near-identical doc already in the corpus
};

interface PendingDoc {
  fileName: string;
  title: string;
  text: string;
  label: CorpusLabel;       // the attorney's working disposition (defaults to the suggestion)
  chars: number;
  clauseTag: string | null; // guideline the model matched
  suggestedLabel: CorpusLabel;
  confidence: number;
  basis: string;
  clauseExcerpt: string;          // this contract's own clause line that drove the call
  precedentTitle: string;         // the precedent it was compared against
  precedentLabel: CorpusLabel | null; // that precedent's disposition (approved/failed)
  precedentExcerpt: string;       // that precedent's specific clause threshold, verbatim
  neighbors: RetrievedPrecedent[];
  duplicateOf: string | null;     // near-identical doc already on file, or null
  skip: boolean;                  // exclude from logging (default true for duplicates)
  cardOpen: boolean;              // is the full card body expanded in the triage modal
  expanded: boolean;              // is the clause-boundary dropdown open inside the card
}

// Triage category for a staged doc, derived from its suggestion, confidence, and
// duplicate status against the live auto-accept threshold. "auto" clears without a
// human read; everything else is routed to the review queue.
type Triage = "flag" | "nomatch" | "low" | "duplicate" | "auto";
const TRIAGE_RANK: Record<Triage, number> = { flag: 0, nomatch: 1, low: 2, duplicate: 3, auto: 4 };
function triageOf(p: PendingDoc, threshold: number): Triage {
  if (p.duplicateOf) return "duplicate";
  if (!p.precedentLabel) return "nomatch";
  if (p.suggestedLabel === "flag") return "flag";
  if ((p.confidence || 0) < threshold) return "low";
  return "auto";
}
const TRIAGE_BADGE: Record<Triage, { label: string; bg: string; fg: string }> = {
  flag: { label: "Flag suggested", bg: "#fbecec", fg: "#b23b3b" },
  nomatch: { label: "No precedent", bg: "#f1f3f5", fg: "#5a6675" },
  low: { label: "Low confidence", bg: "#fdf3e8", fg: "#b5762a" },
  duplicate: { label: "Duplicate", bg: "#eef1f6", fg: "#5a7290" },
  auto: { label: "Auto-cleared pass", bg: "#e9f4ef", fg: "#1f7a5a" },
};

// Clause boundary detail, keyed by the REAL corpus clauseTag values (see
// SEED_PRECEDENTS). Each entry states the standard that is acceptable and the
// boundary that escalates, mirroring the playbook.
const CLAUSE_DETAIL: Record<string, { rule: string; standard: string; boundary: string }> = {
  net_payment_terms: {
    rule: "Net payment terms",
    standard: "Net 60 from invoice date. Net 40 and Net 45 also clear.",
    boundary: "Anything other than Net 40, Net 45, or Net 60 escalates to the attorney.",
  },
  limitation_of_liability: {
    rule: "Limitation of liability",
    standard: "A liability cap is present, with a higher cap for PHI or PII vendors.",
    boundary: "Uncapped liability, or a thin cap for a sensitive-data vendor, escalates.",
  },
  confidentiality: {
    rule: "Confidentiality",
    standard: "Mutual confidentiality with standard carve-outs.",
    boundary: "One-way or absent confidentiality routes to review.",
  },
  ip_ownership: {
    rule: "IP ownership",
    standard: "Iovance owns the assets built for it.",
    boundary: "A vendor retaining IP in deliverables escalates.",
  },
  data_privacy: {
    rule: "Data processing addendum",
    standard: "A DPA is attached for any sensitive-data vendor.",
    boundary: "A missing DPA for a PHI or PII vendor escalates.",
  },
  key_dates: {
    rule: "Key dates and precedence",
    standard: "Amendments state precedence over the base MSA with a forward effective date.",
    boundary: "Missing precedence, or a backdated effective date, escalates.",
  },
  governing_law: {
    rule: "Governing law",
    standard: "US governing law within the agreed venue.",
    boundary: "Non-US governing law routes to review.",
  },
  auto_renewal: {
    rule: "Auto-renewal",
    standard: "Auto-renews for a like term with a 30 to 60 day non-renewal notice and no price escalator.",
    boundary: "Evergreen renewal, a long exit window, a termination-for-convenience waiver, or an automatic price increase escalates.",
  },
  corporate_address: {
    rule: "Contracting entity and address",
    standard: "Correct Iovance contracting entity and its current corporate address.",
    boundary: "A wrong contracting entity or a stale corporate address escalates.",
  },
  invoice_schedule_math: {
    rule: "Invoice and milestone math",
    standard: "Milestone amounts reconcile to the stated total and the not-to-exceed value.",
    boundary: "Milestone amounts that do not sum to the stated total escalate.",
  },
  order_of_precedence: {
    rule: "Order of precedence",
    standard: "Amendment states precedence over the base agreement and carries the full protective block.",
    boundary: "A missing order-of-precedence or protective block escalates.",
  },
};

// Turn a raw clause tag (net_payment_terms) into a natural-language title (Net
// payment terms) for any tag without an explicit CLAUSE_DETAIL entry, so no
// underscore variable ever reaches the screen.
function prettyTag(tag: string | null): string {
  if (!tag) return "Clause";
  const spaced = tag.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function clauseDetail(tag: string | null) {
  return (
    (tag && CLAUSE_DETAIL[tag]) || {
      rule: prettyTag(tag),
      standard: "Standard terms within the playbook tolerances.",
      boundary: "Deviations from the standard escalate to the attorney.",
    }
  );
}

function pillStyle(label: CorpusLabel): { bg: string; fg: string } {
  if (label === "pass") return { bg: "#e9f4ef", fg: "#1f7a5a" };
  if (label === "flag") return { bg: "#fbecec", fg: "#b23b3b" };
  return { bg: "#eef1f6", fg: "#5a7290" };
}

export default function KnowledgePage() {
  const { name: reviewer } = useReviewer();
  const [status, setStatus] = useState<CorpusStatus | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Upload / ingest staging
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Triage controls for large batches. The threshold is the minimum confidence at
  // which a suggested pass is auto-cleared (still logged and auditable); below it,
  // or for any flag / duplicate / no-match, the doc is routed to the human queue.
  const [confThreshold, setConfThreshold] = useState(0.85);
  const [triageFilter, setTriageFilter] = useState<"review" | "auto" | "duplicate" | "all">("review");
  const [groupByClause, setGroupByClause] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);

  // Corpus view: bucket by clause boundary (default) or flat contract-by-contract
  const [corpusView, setCorpusView] = useState<"buckets" | "contracts">("buckets");
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  // Retrieval preview
  const [query, setQuery] = useState("uncapped liability and vendor owns the work product");
  const [precedents, setPrecedents] = useState<RetrievedPrecedent[] | null>(null);

  // Eval ("train" credibility check)
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  // Expanded corpus row
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  // Editable clause thresholds: the deterministic engine's numeric knobs. The
  // saved set is what is in force; the draft is what the editor is moving. Saving
  // re-labels the on-file precedents (the API returns how many flipped) and
  // governs every future upload.
  const [thresholds, setThresholds] = useState<ClauseThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdDraft, setThresholdDraft] = useState<ClauseThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<string | null>(null);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/corpus");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the corpus");
      setStatus(data.status);
      setDocs(data.docs ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pull the thresholds in force on mount so the editor opens on the saved set,
  // not the shipped defaults. Best-effort: a failed read keeps the defaults.
  const loadThresholds = useCallback(async () => {
    try {
      const res = await fetch("/api/thresholds");
      const data = await res.json();
      if (res.ok && data.thresholds) {
        setThresholds(data.thresholds);
        setThresholdDraft(data.thresholds);
      }
    } catch {
      // keep DEFAULT_THRESHOLDS
    }
  }, []);

  useEffect(() => {
    loadThresholds();
  }, [loadThresholds]);

  function setThresholdField(key: ThresholdKey, value: number) {
    setThresholdMsg(null);
    setThresholdDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Stage the shipped defaults; still requires Save to commit, so there is one
  // write path and the corpus only re-labels on an explicit save.
  function resetThresholds() {
    setThresholdMsg(null);
    setThresholdDraft({ ...DEFAULT_THRESHOLDS });
  }

  // Persist the draft, then reflect the re-labeled corpus the API returns. One
  // save is one auditable human touchpoint: it changes how the engine judges
  // paper, so it is logged with the before/after of every changed knob.
  async function saveThresholds() {
    setThresholdSaving(true);
    setThresholdMsg(null);
    setError(null);
    const prev = thresholds;
    try {
      const res = await fetch("/api/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds: thresholdDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save thresholds");
      const saved: ClauseThresholds = data.thresholds;
      setThresholds(saved);
      setThresholdDraft(saved);
      if (data.status) setStatus(data.status);
      await refresh(); // pull the re-labeled corpus rows into the list below
      const changed: number = data.changed ?? 0;
      setThresholdMsg(
        changed > 0
          ? `Saved. ${changed} on-file precedent${changed === 1 ? "" : "s"} re-labeled against the new thresholds.`
          : "Saved. No on-file precedent changed label under the new thresholds."
      );
      const diffs = THRESHOLD_FIELDS.filter((f) => prev[f.key] !== saved[f.key]).map((f) => {
        const fmt = (n: number) => (f.unit === "USD" ? `$${n.toLocaleString("en-US")}` : `${n} ${f.unit}`);
        return `${f.clauseLabel}: ${fmt(prev[f.key])} to ${fmt(saved[f.key])}`;
      });
      logAudit({
        module: "ContractIQ",
        action: "thresholds-changed",
        surface: "Knowledge / Rules & thresholds",
        actor: reviewer,
        actionLabel: "Adjusted clause thresholds",
        subject: diffs.length ? `${diffs.length} clause threshold${diffs.length === 1 ? "" : "s"}` : "Clause thresholds",
        outcome: changed > 0 ? "corpus-relabeled" : "saved",
        detail: `${diffs.length ? diffs.join("; ") : "No numeric change"}. ${changed} on-file precedent(s) re-labeled.`,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setThresholdSaving(false);
    }
  }

  async function post(body: any): Promise<any> {
    const res = await fetch("/api/corpus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The Knowledge action failed");
    return data;
  }

  async function indexAll() {
    setBusy("index");
    setError(null);
    try {
      const data = await post({ action: "index" });
      setStatus(data.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function runEval() {
    setBusy("evaluate");
    setError(null);
    try {
      const data = await post({ action: "evaluate" });
      setEvalResult(data.eval);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function runRetrieve() {
    if (!query.trim()) return;
    setBusy("retrieve");
    setError(null);
    setPrecedents(null);
    try {
      const data = await post({ action: "retrieve", query, k: 4 });
      setPrecedents(data.precedents ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function relabel(id: string, label: CorpusLabel) {
    setError(null);
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, label } : d)));
    try {
      const data = await post({ action: "label", id, label });
      setStatus(data.status);
    } catch (e: any) {
      setError(e.message);
      refresh();
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    setUploadProgress({ phase: "uploading", fraction: 0, fileCount: files.length });
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const { ok, data } = await postFilesWithProgress("/api/upload", form, files.length, setUploadProgress);
      if (!ok) throw new Error(data.error || "Upload failed");
      const readable = (data.files ?? []).filter((f: any) => f.ok && f.text);
      const failed = (data.files ?? []).filter((f: any) => !f.ok);
      if (readable.length === 0) {
        if (failed.length > 0) setError(`No readable text in ${failed.length} file(s).`);
        return;
      }
      // Scan each new doc against the corpus for a grounded pass/flag suggestion
      // before it is logged. Best-effort: if classify fails, stage unlabeled.
      setClassifying(true);
      let suggestions: ClassifySuggestion[] = [];
      try {
        const cls = await post({
          action: "classify",
          docs: readable.map((f: any) => ({ title: f.fileName.replace(/\.[^.]+$/, ""), text: f.text })),
        });
        suggestions = cls.suggestions ?? [];
      } catch {
        suggestions = [];
      } finally {
        setClassifying(false);
      }
      const staged: PendingDoc[] = readable.map((f: any, i: number) => {
        const s = suggestions[i];
        const suggested = s?.suggestedLabel ?? "flag";
        const duplicateOf = s?.duplicateOf ?? null;
        return {
          fileName: f.fileName,
          title: f.fileName.replace(/\.[^.]+$/, ""),
          text: f.text,
          chars: f.chars ?? f.text.length,
          clauseTag: s?.clauseTag ?? null,
          suggestedLabel: suggested,
          confidence: s?.confidence ?? 0,
          basis: s?.basis ?? "No precedent match; review and disposition manually.",
          clauseExcerpt: s?.clauseExcerpt ?? "",
          precedentTitle: s?.precedentTitle ?? "",
          precedentLabel: s?.precedentLabel ?? null,
          precedentExcerpt: s?.precedentExcerpt ?? "",
          neighbors: s?.neighbors ?? [],
          duplicateOf,
          skip: !!duplicateOf, // a re-upload is skipped by default so the batch does not double-count
          cardOpen: false,
          label: suggested,
          expanded: false,
        };
      });
      setPending((prev) => [...prev, ...staged]);
      // Land the reviewer on what needs them, not the auto-cleared pile.
      setTriageFilter("review");
      setReviewOpen(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadBusy(false);
      setUploadProgress(null);
    }
  }

  function setPendingField(i: number, patch: Partial<PendingDoc>) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function dropPending(i: number) {
    setPending((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      if (next.length === 0) setReviewOpen(false);
      return next;
    });
  }

  // Bulk-confirm every suggested pass still in the queue (skips duplicates). Lets a
  // reviewer accept the whole pass pile in one click after a quick scan.
  function acceptAllPasses() {
    setPending((prev) => prev.map((p) => (p.suggestedLabel === "pass" && !p.skip ? { ...p, label: "pass" } : p)));
  }

  function toggleSkip(i: number) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, skip: !p.skip } : p)));
  }

  async function commitPending() {
    const toLog = pending.filter((p) => !p.skip);
    if (toLog.length === 0) return;
    setBusy("add");
    setError(null);
    try {
      const pct = Math.round(confThreshold * 100);
      const data = await post({
        action: "add",
        docs: toLog.map((p) => {
          const auto = triageOf(p, confThreshold) === "auto";
          const note = auto
            ? `Ingested from ${p.fileName}. Auto-cleared at >=${pct}% confidence. ${p.basis}`
            : `Ingested from ${p.fileName}. ${p.basis}`;
          return {
            title: p.title,
            text: p.text,
            label: p.label,
            docType: null,
            vendor: null,
            clauseTag: p.clauseTag,
            note,
          };
        }),
      });
      setStatus(data.status);
      setPending([]);
      setReviewOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const offlineEmbeddings = status?.embeddingModel === "unavailable";
  const fullyIndexed = status ? status.indexed >= status.total && status.total > 0 : false;

  const embModel = offlineEmbeddings ? "lexical fallback (no model download)" : status?.embeddingModel ?? "loading…";
  const emb = offlineEmbeddings
    ? { bg: "#f1f3f5", border: "#e3e6ea", fg: "#5a6675", dot: "#9aa3b0" }
    : { bg: "#e9f4ef", border: "#cfe3d8", fg: "#1f7a5a", dot: "#2f9e78" };

  const dash = (n: number | undefined) => (n === undefined || n === null ? "–" : String(n));
  const corpusStats: { label: string; value: string; color: string }[] = [
    { label: "Total docs", value: dash(status?.total), color: "#16202e" },
    { label: "Pass", value: dash(status?.passCount), color: "#1f7a5a" },
    { label: "Flag", value: dash(status?.flagCount), color: "#b23b3b" },
    { label: "Unlabeled", value: dash(status?.unlabeledCount), color: "#9aa3b0" },
    { label: "Indexed", value: dash(status?.indexed), color: "#16202e" },
    {
      label: "Updated",
      value: status?.lastUpdated ? new Date(status.lastUpdated).toLocaleDateString() : "–",
      color: "#5a6675",
    },
  ];

  const passAgree = evalResult?.perLabel.find((p) => p.label === "pass");
  const flagAgree = evalResult?.perLabel.find((p) => p.label === "flag");

  // Bucket the corpus by clause boundary so a large store stays navigable. Each
  // bucket reports its size and pass/flag split; expanding it reveals the
  // contracts, each still individually relabelable.
  const bucketMap = new Map<string, DocRow[]>();
  for (const d of docs) {
    const key = d.clauseTag ?? "unclassified";
    const arr = bucketMap.get(key);
    if (arr) arr.push(d);
    else bucketMap.set(key, [d]);
  }
  const buckets = [...bucketMap.entries()]
    .map(([tag, items]) => {
      const pass = items.filter((i) => i.label === "pass").length;
      const flag = items.filter((i) => i.label === "flag").length;
      const unlabeled = items.filter((i) => i.label === "unlabeled").length;
      const decided = pass + flag;
      return {
        tag,
        rule: tag === "unclassified" ? "Unclassified" : clauseDetail(tag).rule,
        items,
        count: items.length,
        pass,
        flag,
        unlabeled,
        passRate: decided > 0 ? pass / decided : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  // One corpus row: title + clause, pass/flag toggle, and an expandable clause
  // boundary. Shared by the flat view and the inside of each clause bucket so a
  // contract reviews and relabels identically in either.
  function renderDoc(d: DocRow) {
    const det = clauseDetail(d.clauseTag);
    const expanded = expandedDoc === d.id;
    const passActive = d.label === "pass";
    const flagActive = d.label === "flag";
    const statusNote = passActive ? "Inside the boundary" : flagActive ? "Crosses the boundary" : "Not yet dispositioned";
    const statusBg = passActive ? "#e9f4ef" : flagActive ? "#fbecec" : "#f1f3f5";
    const statusFg = passActive ? "#1f7a5a" : flagActive ? "#b23b3b" : "#5a6675";
    const demonstrates = passActive
      ? "Labeled pass: this precedent sits inside the standard and is kept as a clean reference for retrieval."
      : flagActive
      ? "Labeled flag: this precedent crosses the escalation boundary above and is kept as a flagged example for retrieval."
      : "Unlabeled: indexed and retrievable, but not yet dispositioned by the attorney.";
    return (
      <div key={d.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
        <div onClick={() => setExpandedDoc(expanded ? null : d.id)} style={{ padding: "11px 18px", display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
          <span style={{ color: "#aab2bd", fontSize: 9, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: `rotate(${expanded ? "90deg" : "0deg"})` }}>&#9654;</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "#2a3645", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
            <div style={{ fontSize: 10.5, color: "#9aa3b0" }}>{d.clauseTag ? det.rule : "Unclassified"}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <div onClick={(e) => { e.stopPropagation(); relabel(d.id, "pass"); }} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", background: passActive ? "#e9f4ef" : "#f4f5f7", color: passActive ? "#1f7a5a" : "#aab2bd" }}>pass</div>
            <div onClick={(e) => { e.stopPropagation(); relabel(d.id, "flag"); }} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", background: flagActive ? "#fbecec" : "#f4f5f7", color: flagActive ? "#b23b3b" : "#aab2bd" }}>flag</div>
          </div>
        </div>
        {expanded && (
          <div style={{ padding: "2px 18px 15px 36px", background: "#fafbfc" }}>
            <div style={{ border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 13px", borderBottom: "1px solid #f1f3f5" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645" }}>{det.rule}</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: statusBg, color: statusFg, whiteSpace: "nowrap" }}>{statusNote}</span>
              </div>
              {/* This contract's own verbatim clause line — the exact threshold
                  sentence that drove its pass/flag, so the reviewer sees the
                  evidence specific to this contract, not just the generic rule. */}
              <div style={{ padding: "11px 13px", borderBottom: "1px solid #f1f3f5", background: passActive ? "#f4faf7" : flagActive ? "#fdf5f5" : "#fafbfc" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", marginBottom: 6, color: passActive ? "#1f7a5a" : flagActive ? "#b23b3b" : "#5a6675" }}>
                  {passActive ? "Why this passed · clause in this contract" : flagActive ? "Why this flagged · clause in this contract" : "Clause in this contract"}
                </div>
                <div style={{ fontSize: 12, color: "#2a3645", lineHeight: 1.5, fontStyle: "italic", borderLeft: `2px solid ${passActive ? "#9ed3bd" : flagActive ? "#e6a3a3" : "#d8dde4"}`, paddingLeft: 10 }}>
                  {d.clauseExcerpt ? `“${d.clauseExcerpt}”` : "No clause line could be isolated; review the full document."}
                </div>
                <div style={{ fontSize: 10.5, color: "#9aa3b0", marginTop: 6 }}>
                  {passActive ? "Sits inside the pass threshold below." : flagActive ? "Crosses the escalation boundary below." : "Measured against the threshold below."}
                </div>
              </div>
              <div style={{ padding: "12px 13px", display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2f9e78", marginTop: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Standard, acceptable</div>
                    <div style={{ fontSize: 12, color: "#3a4655", lineHeight: 1.45 }}>{det.standard}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#cf5b5b", marginTop: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 10, color: "#b23b3b", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Escalation boundary</div>
                    <div style={{ fontSize: 12, color: "#3a4655", lineHeight: 1.45 }}>{det.boundary}</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "9px 13px", borderTop: "1px solid #f1f3f5", fontSize: 11, color: "#8893a2", lineHeight: 1.45 }}>{demonstrates}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const ghostBtn: React.CSSProperties = {
    padding: "8px 15px",
    borderRadius: 8,
    border: "1px solid #d8dde4",
    background: "#fff",
    color: "#3a4655",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
  const navyBtn: React.CSSProperties = {
    padding: "8px 15px",
    borderRadius: 8,
    border: "none",
    background: "var(--navy,#1f3a5f)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  // Threshold editor state: is the draft unsaved, and is it already the default?
  const thresholdsDirty = THRESHOLD_FIELDS.some((f) => thresholdDraft[f.key] !== thresholds[f.key]);
  const draftIsDefault = THRESHOLD_FIELDS.every((f) => thresholdDraft[f.key] === DEFAULT_THRESHOLDS[f.key]);

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>
          Knowledge
        </div>
        <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 10px", color: "#16202e" }}>
          Precedent corpus and retrieval
        </h2>
        <p style={{ fontSize: 13.5, color: "#5a6675", lineHeight: 1.55, margin: 0, maxWidth: 780 }}>
          Retrieval returns <span style={{ fontWeight: 600, color: "#2a3645" }}>evidence</span>. The deterministic playbook still owns every
          flag. The eval measures retrieval as a grounding signal, not the correctness of a flag decision.
        </p>
      </div>

      {/* Add precedents (real ingest) — at the top: drop files, the model scans
          each against the corpus, then a review pop-up stages pass/flag before log. */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Add precedents</div>
          {pending.length > 0 && (
            <button onClick={() => setReviewOpen(true)} style={{ ...ghostBtn, padding: "5px 11px", fontSize: 11 }}>
              Review {pending.length} staged
            </button>
          )}
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          style={{ border: `1.5px dashed ${dragging ? "#2f9e78" : "#d8dde4"}`, borderRadius: 9, padding: "26px 16px", textAlign: "center", cursor: "pointer", background: dragging ? "#f5fbf8" : "#fafbfc" }}
        >
          {uploadBusy && uploadProgress ? (
            <div style={{ maxWidth: 360, margin: "0 auto 6px" }}>
              <UploadProgress state={uploadProgress} processingLabel={classifying ? "Scanning against the corpus…" : "Extracting text…"} />
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: "#2a3645", marginBottom: 4 }}>
              Drop past contracts here, or click to choose files
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#9aa3b0" }}>PDF, DOCX, or text. A whole folder of precedents works too. Each is scanned against past precedents for a pass/flag suggestion.</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 9, marginTop: 12 }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={ghostBtn}>Choose files</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }} style={ghostBtn}>Choose a folder</button>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.text,.md,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
          <input ref={folderRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      </div>

      {/* Index status */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Index status</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, background: emb.bg, border: `1px solid ${emb.border}`, fontSize: 11, fontWeight: 600, color: emb.fg }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: emb.dot }} />
              {embModel}
            </span>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={indexAll} disabled={busy === "index" || fullyIndexed} style={{ ...ghostBtn, opacity: busy === "index" || fullyIndexed ? 0.55 : 1 }}>
              {busy === "index" ? "Indexing…" : fullyIndexed ? "Index up to date" : "Index / train"}
            </button>
            <button onClick={runEval} disabled={busy === "evaluate"} style={{ ...navyBtn, opacity: busy === "evaluate" ? 0.7 : 1 }}>
              {busy === "evaluate" ? "Checking…" : "Run accuracy check"}
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 1, background: "#eef0f3", border: "1px solid #eef0f3", borderRadius: 9, overflow: "hidden" }}>
          {corpusStats.map((s) => (
            <div key={s.label} style={{ background: "#fff", padding: "14px 16px" }}>
              <div className="num" style={{ fontSize: 21, fontWeight: 600, color: s.color, letterSpacing: "-.5px" }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: "#9aa3b0", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules & thresholds — the deterministic engine's editable numeric knobs.
          Saving re-labels the on-file precedents below (the API reports how many
          flipped) and governs every future upload. Presence rules sit alongside
          read-only so the reviewer sees the whole rule set, tunable or not. */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Rules &amp; thresholds</div>
            <div style={{ fontSize: 11.5, color: "#9aa3b0", marginTop: 3, maxWidth: 600, lineHeight: 1.5 }}>
              The numeric boundaries the deterministic engine compares every contract against. Move a knob and save: the on-file precedents below are re-labeled against the new line, and every future upload is judged by it.
            </div>
          </div>
          <div style={{ display: "flex", gap: 9, flexShrink: 0 }}>
            <button
              onClick={resetThresholds}
              disabled={thresholdSaving || draftIsDefault}
              style={{ ...ghostBtn, opacity: thresholdSaving || draftIsDefault ? 0.5 : 1 }}
            >
              Reset to defaults
            </button>
            <button
              onClick={saveThresholds}
              disabled={thresholdSaving || !thresholdsDirty}
              style={{ ...navyBtn, opacity: thresholdSaving || !thresholdsDirty ? 0.55 : 1 }}
            >
              {thresholdSaving ? "Saving…" : "Save thresholds"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          {THRESHOLD_FIELDS.map((f) => {
            const v = thresholdDraft[f.key];
            const changed = v !== thresholds[f.key];
            const display = f.unit === "USD" ? `$${v.toLocaleString("en-US")}` : `${v} ${f.unit}`;
            return (
              <div
                key={f.key}
                style={{
                  border: `1px solid ${changed ? "#cfdcea" : "#eef0f3"}`,
                  borderRadius: 9,
                  padding: "13px 15px",
                  background: changed ? "#f7fafd" : "#fafbfc",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645" }}>{f.label}</div>
                  <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#eef1f6", color: "#5a7290", whiteSpace: "nowrap" }}>{f.clauseLabel}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={v}
                    onChange={(e) => setThresholdField(f.key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#1f3a5f", cursor: "pointer" }}
                  />
                  <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: "#16202e", minWidth: 92, textAlign: "right" }}>{display}</div>
                </div>
                <div style={{ fontSize: 11, color: changed ? "#2e6da4" : "#7a8493", marginTop: 9, lineHeight: 1.45 }}>{f.rule(v)}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "#9aa3b0", marginBottom: 9 }}>
            Presence rules · no number to tune
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PRESENCE_RULES.map((r) => (
              <div key={r.clauseTag} style={{ border: "1px solid #eef0f3", borderRadius: 8, padding: "10px 13px", background: "#fbfcfd" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#2a3645", marginBottom: 3 }}>{r.clauseLabel}</div>
                <div style={{ fontSize: 10.5, color: "#7a8493", lineHeight: 1.5 }}>{r.rule}</div>
              </div>
            ))}
          </div>
        </div>

        {(thresholdMsg || thresholdsDirty) && (
          <div style={{ marginTop: 16, fontSize: 11.5, fontWeight: 500, color: thresholdMsg ? "#1f7a5a" : "#b5762a" }}>
            {thresholdMsg || "Unsaved changes. Save to re-label the corpus and apply the new line to future uploads."}
          </div>
        )}
      </div>

      {/* Eval band */}
      {evalResult && (
        <div style={{ background: "#f2f7f4", border: "1px solid #d7e8df", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div className="num" style={{ fontSize: 28, fontWeight: 600, color: "#1f7a5a", letterSpacing: "-1px" }}>
                {Math.round(evalResult.accuracy * 100)}%
              </div>
              <div style={{ fontSize: 11, color: "#3f7a64" }}>leave-one-out agreement</div>
            </div>
            <div style={{ fontSize: 12.5, color: "#3f6655", lineHeight: 1.55, flex: 1, minWidth: 240 }}>
              Tested against {evalResult.evaluated} labeled past contracts; the nearest labeled neighbor shared the held-out
              doc&rsquo;s label {evalResult.correct} times. This measures retrieval as a grounding signal, not whether the
              playbook flag was right.
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              <div>
                <div className="num" style={{ fontSize: 15, fontWeight: 600, color: "#1f7a5a" }}>
                  {passAgree ? `${passAgree.correct}/${passAgree.evaluated}` : "–"}
                </div>
                <div style={{ fontSize: 10.5, color: "#6a9a86" }}>pass agree</div>
              </div>
              <div>
                <div className="num" style={{ fontSize: 15, fontWeight: 600, color: "#b23b3b" }}>
                  {flagAgree ? `${flagAgree.correct}/${flagAgree.evaluated}` : "–"}
                </div>
                <div style={{ fontSize: 10.5, color: "#6a9a86" }}>flag agree</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "#fdf2f2", border: "1px solid #f0d4d4", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12.5, color: "#b23b3b" }}>
          {error}
        </div>
      )}

      {/* Two-column: corpus + retrieval */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Corpus list */}
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Corpus</div>
            <div style={{ display: "inline-flex", border: "1px solid #e3e6ea", borderRadius: 7, overflow: "hidden" }}>
              {(["buckets", "contracts"] as const).map((v) => {
                const on = corpusView === v;
                return (
                  <button
                    key={v}
                    onClick={() => setCorpusView(v)}
                    style={{ padding: "5px 11px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: on ? "#1f3a5f" : "#fff", color: on ? "#fff" : "#7a8493" }}
                  >
                    {v === "buckets" ? "By clause" : "By contract"}
                  </button>
                );
              })}
            </div>
          </div>
          {loading ? (
            <div style={{ padding: "24px 18px", fontSize: 12, color: "#9aa3b0" }}>Loading corpus…</div>
          ) : docs.length === 0 ? (
            <div style={{ padding: "24px 18px", fontSize: 12, color: "#9aa3b0" }}>No precedents yet. Add some above to ground the review.</div>
          ) : corpusView === "contracts" ? (
            docs.map(renderDoc)
          ) : (
            buckets.map((b) => {
              const open = expandedBucket === b.tag;
              const rate = b.passRate === null ? "–" : `${Math.round(b.passRate * 100)}%`;
              const det = clauseDetail(b.tag);
              return (
                <div key={b.tag} style={{ borderBottom: "1px solid #f1f3f5" }}>
                  <div onClick={() => setExpandedBucket(open ? null : b.tag)} style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 11, cursor: "pointer", background: open ? "#fafbfc" : "#fff" }}>
                    <span style={{ color: "#aab2bd", fontSize: 9, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: `rotate(${open ? "90deg" : "0deg"})` }}>&#9654;</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645" }}>{b.rule}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ textAlign: "right" }}>
                        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "#16202e" }}>{b.count}</div>
                        <div style={{ fontSize: 9.5, color: "#9aa3b0" }}>contracts</div>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#e9f4ef", color: "#1f7a5a" }}>{b.pass} pass</span>
                        <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#fbecec", color: "#b23b3b" }}>{b.flag} flag</span>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 38 }}>
                        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "#1f7a5a" }}>{rate}</div>
                        <div style={{ fontSize: 9.5, color: "#9aa3b0" }}>pass rate</div>
                      </div>
                    </div>
                  </div>
                  {open && (
                    <div style={{ background: "#fafbfc", padding: "4px 0 12px" }}>
                      {/* Pass threshold for this clause: the minimum standard an
                          Iovance precedent usually has to clear to net a pass. */}
                      {b.tag !== "unclassified" && (
                        <div style={{ margin: "8px 18px 10px 40px", padding: "9px 12px", background: "#eef6f1", border: "1px solid #d7e8df", borderRadius: 8 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: "#1f7a5a" }}>Passes when</span>
                          <span style={{ fontSize: 11.5, color: "#3a5b4d", lineHeight: 1.45, marginLeft: 8 }}>{det.standard}</span>
                        </div>
                      )}
                      {/* Constituent contracts, nested as subpoints under the clause. */}
                      <div style={{ marginLeft: 28, borderLeft: "2px solid #e3e6ea" }}>
                        <div style={{ padding: "2px 18px 6px 12px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: "#aab2bd" }}>
                          {b.count} contract{b.count === 1 ? "" : "s"} in this clause
                        </div>
                        {b.items.map(renderDoc)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Retrieval preview */}
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38", marginBottom: 12 }}>Retrieval preview</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 15 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runRetrieve(); }}
              placeholder="e.g. uncapped liability for a PHI vendor"
              style={{ flex: 1, padding: "10px 13px", border: "1px solid #d8dde4", borderRadius: 8, fontSize: 12.5, color: "#2a3645", outline: "none" }}
            />
            <button onClick={runRetrieve} disabled={busy === "retrieve" || !query.trim()} style={{ ...navyBtn, padding: "10px 16px", opacity: busy === "retrieve" || !query.trim() ? 0.6 : 1 }}>
              {busy === "retrieve" ? "Retrieving…" : "Retrieve"}
            </button>
          </div>
          {precedents && precedents.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {precedents.map((p) => {
                const pill = pillStyle(p.label);
                const pct = Math.round(p.score * 100);
                return (
                  <div key={p.id} style={{ border: "1px solid #eef0f3", borderRadius: 9, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: pill.bg, color: pill.fg }}>{p.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#2a3645", flex: 1 }}>{p.title}</span>
                      <span className="num" style={{ fontSize: 11.5, color: "#6a7484", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {pct}% <span style={{ fontWeight: 500, color: "#9aa3b0" }}>relevance</span>
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "#eef0f3", overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent,#2f9e78)", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>{p.note}</div>
                  </div>
                );
              })}
            </div>
          ) : precedents && precedents.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 12, color: "#9aa3b0", lineHeight: 1.5 }}>
              No precedents returned. The corpus may be empty or embeddings unavailable.
            </div>
          ) : (
            <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 12, color: "#9aa3b0", lineHeight: 1.5 }}>
              Enter a query to preview the precedents ContractIQ would retrieve as evidence.
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: "#9aa3b0", lineHeight: 1.6, maxWidth: 920 }}>
        The accuracy check measures retrieval as a grounding signal: does the nearest precedent share the held-out
        disposition, not whether a flag is correct. The playbook owns every pass/flag decision; an attorney confirms every
        contract before execution. Synthetic precedents, not real Iovance contracts.
      </div>

      {/* Triage queue: a batch of contracts is scanned against the corpus, then
          this pop-up sorts the exceptions (flags, low-confidence, duplicates, no
          match) to the top and auto-clears the high-confidence passes so a reviewer
          reads the ~18 that need a human, not all 100. Nothing logs before commit. */}
      {reviewOpen && pending.length > 0 && (() => {
        const triaged = pending.map((p, i) => ({ p, i, cat: triageOf(p, confThreshold) }));
        const counts = {
          total: pending.length,
          review: triaged.filter((t) => t.cat !== "auto" && !t.p.skip).length,
          auto: triaged.filter((t) => t.cat === "auto").length,
          duplicate: triaged.filter((t) => t.cat === "duplicate").length,
        };
        const toLogCount = pending.filter((p) => !p.skip).length;
        const threshPct = Math.round(confThreshold * 100);
        const stepThreshold = (delta: number) =>
          setConfThreshold((v) => Math.min(0.99, Math.max(0.5, Math.round((v + delta) * 100) / 100)));
        const sorted = [...triaged].sort((a, b) => TRIAGE_RANK[a.cat] - TRIAGE_RANK[b.cat]);
        const visible = sorted.filter((t) => {
          if (triageFilter === "all") return true;
          if (triageFilter === "review") return t.cat !== "auto";
          if (triageFilter === "auto") return t.cat === "auto";
          return t.cat === "duplicate";
        });
        const chips: { key: typeof triageFilter; label: string; n: number }[] = [
          { key: "review", label: "Needs review", n: counts.review },
          { key: "auto", label: "Auto-cleared", n: counts.auto },
          { key: "duplicate", label: "Duplicates", n: counts.duplicate },
          { key: "all", label: "All", n: counts.total },
        ];

        // Group the visible rows by clause when the reviewer asks for it, so a
        // batch reads as "everything that touched auto-renewal" rather than a flat list.
        const groups: { tag: string; rule: string; standard: string | null; rows: typeof visible }[] = [];
        if (groupByClause) {
          const gmap = new Map<string, typeof visible>();
          for (const t of visible) {
            const key = t.p.clauseTag ?? "unclassified";
            const arr = gmap.get(key);
            if (arr) arr.push(t);
            else gmap.set(key, [t]);
          }
          for (const [tag, rows] of gmap.entries()) {
            const det = clauseDetail(tag === "unclassified" ? null : tag);
            groups.push({ tag, rule: tag === "unclassified" ? "Unclassified" : det.rule, standard: tag === "unclassified" ? null : det.standard, rows });
          }
        } else {
          groups.push({ tag: "__all__", rule: "", standard: null, rows: visible });
        }

        const renderCard = (t: { p: PendingDoc; i: number; cat: Triage }) => {
          const { p, i, cat } = t;
          const det = clauseDetail(p.clauseTag);
          const pct = Math.round((p.confidence || 0) * 100);
          const passActive = p.label === "pass";
          const flagActive = p.label === "flag";
          const badge = TRIAGE_BADGE[cat];
          const open = p.cardOpen;
          return (
            <div key={`${p.fileName}-${i}`} style={{ flexShrink: 0, border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden", opacity: p.skip ? 0.6 : 1 }}>
              {/* Compact row — collapsed by default so a big batch scans fast. */}
              <div onClick={() => setPendingField(i, { cardOpen: !open })} style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: open ? "#fafbfc" : "#fff" }}>
                <span style={{ color: "#aab2bd", fontSize: 9, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: `rotate(${open ? "90deg" : "0deg"})` }}>&#9654;</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: p.skip ? "line-through" : "none" }}>{p.title}</div>
                  <div style={{ fontSize: 10.5, color: "#9aa3b0" }}>{p.clauseTag ? det.rule : "No clause matched"}{p.duplicateOf ? ` · duplicate of "${p.duplicateOf}"` : ""}</div>
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".3px", padding: "2px 8px", borderRadius: 5, background: badge.bg, color: badge.fg, whiteSpace: "nowrap", flexShrink: 0 }}>{badge.label}</span>
                <span className="num" style={{ fontSize: 11, color: "#7a8493", fontWeight: 600, width: 34, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <div onClick={() => setPendingField(i, { label: "pass" })} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${passActive ? "#cfe3d8" : "#e3e6ea"}`, background: passActive ? "#e9f4ef" : "#fff", color: passActive ? "#1f7a5a" : "#aab2bd" }}>pass</div>
                  <div onClick={() => setPendingField(i, { label: "flag" })} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${flagActive ? "#f0d4d4" : "#e3e6ea"}`, background: flagActive ? "#fbecec" : "#fff", color: flagActive ? "#b23b3b" : "#aab2bd" }}>flag</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleSkip(i); }} style={{ ...ghostBtn, padding: "4px 9px", fontSize: 10.5, color: p.skip ? "#1f7a5a" : "#7a8493", borderColor: "#e3e6ea", flexShrink: 0 }}>{p.skip ? "Keep" : "Skip"}</button>
              </div>

              {open && (
                <>
                  {p.duplicateOf && (
                    <div style={{ borderTop: "1px solid #f1f3f5", padding: "10px 15px", background: "#f7f9fc", fontSize: 11.5, color: "#5a7290", lineHeight: 1.45 }}>
                      Near-identical to <span style={{ fontWeight: 600 }}>{`“${p.duplicateOf}”`}</span> already in the corpus. Skipped by default so the batch does not double-count; press Keep to log it anyway.
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #f1f3f5", padding: "12px 15px", display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="text"
                        value={p.title}
                        onChange={(e) => setPendingField(i, { title: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #d8dde4", borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: "#2a3645", outline: "none" }}
                      />
                      <div style={{ fontSize: 10.5, color: "#9aa3b0", marginTop: 4 }}>{p.fileName} · {p.chars.toLocaleString()} chars</div>
                    </div>
                    <button onClick={() => dropPending(i)} style={{ ...ghostBtn, color: "#b23b3b", borderColor: "#f0d4d4", padding: "6px 11px" }}>Remove</button>
                  </div>

                  {/* Clause comparison — this contract's clause line vs the precedent it matched. */}
                  <div style={{ borderTop: "1px solid #f1f3f5", padding: "12px 15px", background: "#fcfcfd" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 9.5, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px" }}>Identified clause</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645" }}>{det.rule}</span>
                      {p.precedentLabel && (
                        <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, letterSpacing: ".3px", padding: "2px 8px", borderRadius: 5, background: p.precedentLabel === "pass" ? "#e9f4ef" : "#fbecec", color: p.precedentLabel === "pass" ? "#1f7a5a" : "#b23b3b" }}>
                          {p.precedentLabel === "pass" ? "MATCHED AN APPROVED CLAUSE" : "MATCHED A FAILED CLAUSE"}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: 9, alignItems: "start" }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#5a6675", letterSpacing: ".3px", paddingTop: 2 }}>THIS CONTRACT</div>
                      <div style={{ fontSize: 12, color: "#2a3645", lineHeight: 1.5, fontStyle: "italic", borderLeft: "2px solid #d8dde4", paddingLeft: 10 }}>
                        {p.clauseExcerpt ? `“${p.clauseExcerpt}”` : "No clause text could be isolated; review the full document."}
                      </div>
                      {p.precedentExcerpt ? (
                        <>
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: p.precedentLabel === "pass" ? "#1f7a5a" : "#b23b3b", letterSpacing: ".3px", paddingTop: 12 }}>
                            {p.precedentLabel === "pass" ? "APPROVED AT" : "FAILED AT"}
                          </div>
                          <div style={{ paddingTop: 10 }}>
                            <div style={{ fontSize: 12, color: "#3a4655", lineHeight: 1.5, fontStyle: "italic", borderLeft: `2px solid ${p.precedentLabel === "pass" ? "#9ed3bd" : "#e6a3a3"}`, paddingLeft: 10 }}>
                              {`“${p.precedentExcerpt}”`}
                            </div>
                            <div style={{ fontSize: 10.5, color: "#9aa3b0", marginTop: 4, paddingLeft: 10 }}>
                              precedent: {p.precedentTitle} · {pct}% match
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9aa3b0", letterSpacing: ".3px", paddingTop: 12 }}>NO MATCH</div>
                          <div style={{ fontSize: 11.5, color: "#9aa3b0", lineHeight: 1.45, paddingTop: 10 }}>
                            No labeled precedent for this clause yet. Defaulting to flag for attorney review.
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px dashed #eef0f3", fontSize: 11, color: "#7a8493", lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 600, color: "#5a6675" }}>Playbook threshold:</span> {det.boundary}
                    </div>
                  </div>

                  {/* Identified guideline — expandable dropdown */}
                  <div style={{ borderTop: "1px solid #f1f3f5" }}>
                    <div onClick={() => setPendingField(i, { expanded: !p.expanded })} style={{ padding: "10px 15px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: "#fafbfc" }}>
                      <span style={{ color: "#aab2bd", fontSize: 9, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: `rotate(${p.expanded ? "90deg" : "0deg"})` }}>&#9654;</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645" }}>{det.rule}</div>
                        <div style={{ fontSize: 10.5, color: "#9aa3b0" }}>{p.clauseTag ? "Standard and escalation boundary" : "No clause matched"}</div>
                      </div>
                      <span style={{ fontSize: 10.5, color: "#7a8493" }}>{pct}% match</span>
                    </div>
                    {p.expanded && (
                      <div style={{ padding: "2px 15px 14px 33px", background: "#fafbfc" }}>
                        <div style={{ border: "1px solid #eef0f3", borderRadius: 8, background: "#fff", padding: "12px 13px", display: "flex", flexDirection: "column", gap: 11 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2f9e78", marginTop: 4, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Standard, acceptable</div>
                              <div style={{ fontSize: 12, color: "#3a4655", lineHeight: 1.45 }}>{det.standard}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#cf5b5b", marginTop: 4, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 10, color: "#b23b3b", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Escalation boundary</div>
                              <div style={{ fontSize: 12, color: "#3a4655", lineHeight: 1.45 }}>{det.boundary}</div>
                            </div>
                          </div>
                          {p.neighbors.length > 0 && (
                            <div style={{ borderTop: "1px solid #f1f3f5", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                              <div style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px" }}>Nearest precedents</div>
                              {p.neighbors.map((n) => {
                                const pill = pillStyle(n.label);
                                return (
                                  <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 9.5, fontWeight: 600, background: pill.bg, color: pill.fg }}>{n.label}</span>
                                    <span style={{ fontSize: 11.5, color: "#3a4655", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>
                                    <span className="num" style={{ fontSize: 11, color: "#7a8493", fontWeight: 600 }}>{Math.round(n.score * 100)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggested disposition + selectable pass/flag */}
                  <div style={{ borderTop: "1px solid #f1f3f5", padding: "12px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, color: "#9aa3b0", marginBottom: 3 }}>
                        Suggested <span style={{ fontWeight: 600, color: p.suggestedLabel === "pass" ? "#1f7a5a" : "#b23b3b" }}>{p.suggestedLabel}</span> · {pct}% confidence
                      </div>
                      <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>{p.basis}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <div onClick={() => setPendingField(i, { label: "pass" })} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${passActive ? "#cfe3d8" : "#e3e6ea"}`, background: passActive ? "#e9f4ef" : "#fff", color: passActive ? "#1f7a5a" : "#aab2bd" }}>pass</div>
                      <div onClick={() => setPendingField(i, { label: "flag" })} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${flagActive ? "#f0d4d4" : "#e3e6ea"}`, background: flagActive ? "#fbecec" : "#fff", color: flagActive ? "#b23b3b" : "#aab2bd" }}>flag</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        };

        return (
          <div
            onClick={() => setReviewOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,28,40,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", zIndex: 50, overflowY: "auto" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 760, maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(20,28,40,.3)", overflow: "hidden" }}
            >
              <div style={{ flexShrink: 0, padding: "18px 22px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#16202e" }}>Triage {pending.length} staged contract{pending.length === 1 ? "" : "s"}</div>
                  <div style={{ fontSize: 11.5, color: "#9aa3b0", marginTop: 2 }}>
                    {classifying
                      ? "Scanning each file against past precedents…"
                      : `${counts.review} need a human · ${counts.auto} auto-cleared at ≥${threshPct}%${counts.duplicate > 0 ? ` · ${counts.duplicate} duplicate${counts.duplicate === 1 ? "" : "s"}` : ""}.`}
                  </div>
                </div>
                <button onClick={() => setReviewOpen(false)} style={{ ...ghostBtn, padding: "6px 11px" }}>Close</button>
              </div>

              {/* Triage controls: auto-accept threshold, filter chips, group-by-clause. */}
              <div style={{ flexShrink: 0, padding: "12px 22px", borderBottom: "1px solid #eef0f3", background: "#fafbfc", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#5a6675" }}>Auto-accept passes at ≥</span>
                  <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid #d8dde4", borderRadius: 7, overflow: "hidden" }}>
                    <button onClick={() => stepThreshold(-0.05)} style={{ border: "none", background: "#fff", color: "#5a6675", fontSize: 13, fontWeight: 700, width: 26, height: 26, cursor: "pointer" }}>−</button>
                    <span className="num" style={{ fontSize: 12, fontWeight: 700, color: "#1f3a5f", width: 40, textAlign: "center" }}>{threshPct}%</span>
                    <button onClick={() => stepThreshold(0.05)} style={{ border: "none", background: "#fff", color: "#5a6675", fontSize: 13, fontWeight: 700, width: 26, height: 26, cursor: "pointer" }}>+</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {chips.map((c) => {
                    const on = triageFilter === c.key;
                    return (
                      <button key={c.key} onClick={() => setTriageFilter(c.key)} style={{ padding: "4px 11px", borderRadius: 14, border: `1px solid ${on ? "#1f3a5f" : "#e3e6ea"}`, background: on ? "#1f3a5f" : "#fff", color: on ? "#fff" : "#5a6675", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        {c.label} {c.n}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setGroupByClause((v) => !v)} style={{ ...ghostBtn, padding: "4px 11px", fontSize: 11, marginLeft: "auto", background: groupByClause ? "#eef1f6" : "#fff", color: groupByClause ? "#1f3a5f" : "#5a6675" }}>
                  {groupByClause ? "Grouped by clause" : "Group by clause"}
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                {visible.length === 0 ? (
                  <div style={{ padding: "26px 16px", textAlign: "center", fontSize: 12, color: "#9aa3b0", lineHeight: 1.5 }}>
                    Nothing in this view. {counts.review === 0 ? "Every staged contract auto-cleared; switch to All or Auto-cleared to see them." : "Switch filters to see the rest of the batch."}
                  </div>
                ) : groupByClause ? (
                  groups.map((g) => (
                    <div key={g.tag} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#2a3645" }}>{g.rule}</span>
                        <span style={{ fontSize: 10.5, color: "#9aa3b0" }}>{g.rows.length} contract{g.rows.length === 1 ? "" : "s"}</span>
                      </div>
                      {g.standard && (
                        <div style={{ padding: "7px 11px", background: "#eef6f1", border: "1px solid #d7e8df", borderRadius: 8, fontSize: 11, color: "#3a5b4d", lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700, color: "#1f7a5a", textTransform: "uppercase", letterSpacing: ".3px", fontSize: 9.5, marginRight: 6 }}>Passes when</span>
                          {g.standard}
                        </div>
                      )}
                      {g.rows.map(renderCard)}
                    </div>
                  ))
                ) : (
                  visible.map(renderCard)
                )}
              </div>

              <div style={{ flexShrink: 0, padding: "15px 22px", borderTop: "1px solid #eef0f3", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button onClick={commitPending} disabled={busy === "add" || classifying || toLogCount === 0} style={{ ...navyBtn, opacity: busy === "add" || classifying || toLogCount === 0 ? 0.6 : 1 }}>
                  {busy === "add" ? "Embedding & logging…" : `Log ${toLogCount} to corpus`}
                </button>
                <button onClick={acceptAllPasses} disabled={busy === "add"} style={{ ...ghostBtn, opacity: busy === "add" ? 0.6 : 1 }}>Accept all suggested passes</button>
                <button onClick={() => { setPending([]); setReviewOpen(false); }} disabled={busy === "add"} style={{ ...ghostBtn, color: "#b23b3b", borderColor: "#f0d4d4" }}>Discard all</button>
                <span style={{ fontSize: 11, color: "#9aa3b0", flex: 1, textAlign: "right", minWidth: 160 }}>
                  {counts.auto} auto-cleared, logged and auditable. {counts.duplicate} duplicate{counts.duplicate === 1 ? "" : "s"} skipped.
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
