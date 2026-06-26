"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { DecisionSource, HumanAction, Invoice, InvoiceIngestResponse, MatchResult, MatchStatus, PersistedTriage, StoredDecision, StoredUpload, TriageResponse } from "@/lib/types";
import { DuplicateCheck, DuplicateKind } from "@/lib/dedup";
import { triageBatchKey } from "@/lib/triageKey";
import { INVOICES, SAMPLE_UPLOAD_INVOICES } from "@/lib/mockData";
import { exportSheets, ExportFormat, Sheet } from "@/lib/export";
import { logAudit } from "@/lib/auditClient";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { useEngine } from "../components/engine";
import { useReviewer } from "../components/reviewer";
import { UploadProgress } from "../components/UploadProgress";

// BudgetIQ invoice/PO matching, ported to the approved design comp. The
// deterministic core (lib/matching) links the clean invoices and runs every
// budget check; /api/triage asks Claude to resolve the fuzzy-vendor tail and
// draft exception triage, then the core recomputes the money decision so every
// cleared invoice is auditable. Dollars live on the Impact tab; this surface is
// the working queue.
//
// The shared record makes the handoff real: this page also reads the records
// ContractIQ committed (GET /api/records) and flags which invoices key off a
// record an attorney already reviewed (same normalized vendor). The Engine
// toggle forces the deterministic path so a presenter can show both engines.

interface RecordClearanceLite {
  status: "clean-pass" | "human-accepted";
  flags: number;
  reviews: number;
  accepted: number;
  dismissed: number;
}

interface SharedRecordLite {
  id: string;
  vendor: string | null;
  sourceName: string;
  extraction: { paymentSchedule: string | null; totalValue: number | null };
  clearance?: RecordClearanceLite | null;
}

// An uploaded invoice PDF after it has been read and parsed: the structured
// invoice plus where it came from, which engine parsed it, the persisted id (so
// it can be deleted), and any human review decision (persisted across sessions).
interface UploadedInvoice {
  id: string;
  invoice: Invoice;
  sourceName: string;
  engine: InvoiceIngestResponse["_meta"]["engine"];
  decision: HumanAction | null;
}

interface UploadNote {
  fileName: string;
  ok: boolean;
  detail: string;
  warn?: string; // non-fatal flag, e.g. a duplicate caught at ingest
}

// A reviewer's hand-entered resolution for an exception they take over manually:
// the PO / work order they assign by hand, plus an optional free-text note. Held
// in session state (the seeded demo rows are client-only, like their decisions);
// the audit trail and the bottom ledger both read it so a manual correction is
// visible end to end, not just a generic "handled" stamp.
interface ManualResolution {
  po: string;   // PO / work order assigned by hand, may be empty
  note: string; // free-text resolution, may be empty
}

function pct(n: number): string { return `${Math.round(n * 100)}%`; }
function usd(n: number): string { return `$${Math.round(n).toLocaleString()}`; }

function normVendor(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS_STYLE: Record<MatchStatus, { stBg: string; stFg: string; label: string }> = {
  matched: { stBg: "#e9f4ef", stFg: "#1f7a5a", label: "matched" },
  review: { stBg: "#fbf4e3", stFg: "#9a6b00", label: "review" },
  over_budget: { stBg: "#fbecec", stFg: "#b23b3b", label: "over budget" },
  no_po: { stBg: "#fbecec", stFg: "#b23b3b", label: "no PO" },
};

function srcStyle(src: DecisionSource): { srcBg: string; srcFg: string; label: string; dot: string } {
  if (src === "ai") return { srcBg: "#ece9f9", srcFg: "#5b54a3", label: "AI", dot: "#7a72c0" };
  if (src === "human") return { srcBg: "#e9f4ef", srcFg: "#1f7a5a", label: "human", dot: "#2f9e78" };
  return { srcBg: "#e7eefb", srcFg: "#2e6da4", label: "rule", dot: "#5a7290" };
}

function confColor(status: MatchStatus): string {
  return status === "matched" ? "#1f7a5a" : status === "review" ? "#9a6b00" : "#b23b3b";
}

// Visual treatment for a dedup verdict. Payment-risk kinds read red (held for a
// human); revision/credit read neutral (legitimate, shown as context).
function dupTag(kind: DuplicateKind): { bg: string; fg: string; label: string } | null {
  switch (kind) {
    case "exact-duplicate": return { bg: "#fbecec", fg: "#b23b3b", label: "duplicate" };
    case "same-number": return { bg: "#fbecec", fg: "#b23b3b", label: "dup number" };
    case "revision": return { bg: "#fbf4e3", fg: "#9a6b00", label: "revision" };
    case "credit-memo": return { bg: "#eef1fb", fg: "#3a5fb0", label: "credit" };
    default: return null;
  }
}

// A short label for an ingest-time dedup verdict, used in the upload note.
function dupNoteText(d: DuplicateCheck): string {
  const at = d.matches[0]?.invoiceNumber;
  if (d.kind === "revision") return at ? `revises ${at}` : "revised invoice";
  if (d.kind === "credit-memo") return at ? `credit against ${at}` : "credit memo";
  return at ? `possible duplicate of ${at}; held for a human` : "possible duplicate; held for a human";
}

// The document types the upload parser can read. A folder pick or folder drop
// returns everything inside (including .DS_Store, images, nested junk), so the
// upload handler keeps only files whose name ends in one of these.
const ACCEPTED_INVOICE_RE = /\.(pdf|docx|txt|text|md)$/i;

// Flatten a drag-drop payload to a File[], descending into any dropped folders
// via the webkitGetAsEntry directory API so a dropped folder uploads every
// invoice inside it. The entries are gathered synchronously (the DataTransfer is
// only valid during the drop event); directory reads then resolve async. Falls
// back to the flat dataTransfer.files when the entries API is unavailable.
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items
    .map((it) => (typeof (it as any).webkitGetAsEntry === "function" ? (it as any).webkitGetAsEntry() : null))
    .filter(Boolean) as any[];
  if (entries.length === 0) return dt.files ? Array.from(dt.files) : [];

  const out: File[] = [];
  const readEntry = (entry: any): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f: File) => { out.push(f); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => {
          // A directory reader returns its children in batches; keep calling
          // until an empty batch signals the end.
          reader.readEntries(async (batch: any[]) => {
            if (!batch.length) { resolve(); return; }
            for (const e of batch) await readEntry(e);
            readBatch();
          }, () => resolve());
        };
        readBatch();
      } else {
        resolve();
      }
    });

  for (const e of entries) await readEntry(e);
  return out;
}

const TRIAGE_COLS = "1fr 1.6fr .85fr .9fr .9fr .65fr .95fr";

export default function InvoiceMatchingPage() {
  const { forceOffline, demoMode } = useEngine();
  const { name: reviewer } = useReviewer();

  const [data, setData] = useState<TriageResponse | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const [records, setRecords] = useState<SharedRecordLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, HumanAction>>({});
  // Hand-entered resolutions for rows taken over manually, keyed by invoice
  // number. `manualFor` is the invoice whose manual-entry form is open (null when
  // none); `poDraft` / `noteDraft` hold the in-progress form values.
  const [manualResolutions, setManualResolutions] = useState<Record<string, ManualResolution>>({});
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [poDraft, setPoDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<UploadedInvoice[]>([]);
  const [uploadNotes, setUploadNotes] = useState<UploadNote[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const demoRanRef = useRef(false);

  // The folder picker needs the non-standard webkitdirectory/directory attributes,
  // which React does not expose as typed props. Set them on the hidden input
  // imperatively so selecting a folder yields every file inside it.
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
      folderRef.current.setAttribute("mozdirectory", "");
    }
  }, []);

  const uploadedNums = new Set(uploaded.map((u) => u.invoice.invoiceNumber));

  // The triage batch is the seeded queue plus anything uploaded. Triage runs ONLY
  // when the user presses Run (no auto-run on mount, upload, or engine toggle): it
  // is the expensive step (live mode calls the model). The result is persisted
  // server-side and tagged with this batch's signature, so the page can show the
  // last run on reload without re-running, and flag a stale result when the queue
  // has changed since.
  // Run triage on an explicit batch + PO dataset. The dataset selects the PO
  // universe the check resolves against: "demo" (the 6 golden-demo POs) keeps the
  // scripted seed run byte-for-byte unchanged, while "all" adds the PO register
  // (PO-2026-###) so uploaded/sample invoices that cite a register PO actually
  // match by RULE (exact PO or normalized vendor) instead of all falling to the AI
  // exception queue. That keeps the deterministic engine visibly the first step.
  const runTriageBatch = useCallback(async (batch: Invoice[], dataset: "demo" | "all") => {
    setLoading(true);
    setError(null);
    const key = triageBatchKey(forceOffline, batch);
    try {
      const triageRes = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: batch, forceOffline, dataset }),
      });
      const json = await triageRes.json();
      if (!triageRes.ok) throw new Error(json.error || "Triage failed");
      setData(json);
      setLastRunKey(key);
      const recRes = await fetch("/api/records");
      if (recRes.ok) {
        const recJson = await recRes.json();
        setRecords(recJson.records ?? []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [forceOffline]);

  // Run triage on the current queue (seed + anything uploaded). With uploads
  // present, resolve against the full register so corpus invoices match by rule;
  // seed-only stays on the demo POs so the golden demo is unchanged.
  const runTriage = useCallback(() => {
    const batch: Invoice[] = [...INVOICES, ...uploaded.map((u) => u.invoice)];
    return runTriageBatch(batch, uploaded.length > 0 ? "all" : "demo");
  }, [uploaded, runTriageBatch]);

  // Remove a single committed record (undo a mistaken commit) and refresh the
  // handoff list from the server's new state.
  async function removeRecord(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/records?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        setRecords(json.records ?? []);
      }
    } catch {
      /* leave the list as-is if the delete cannot reach the store */
    } finally {
      setRemovingId(null);
    }
  }

  // Demo mode: auto-run triage on entry so every match state (matched, review,
  // over_budget, no_po, plus the wrong-PO vendor-mismatch exception) is populated
  // in one click, with no manual Run. Guarded per mount so it fires once.
  useEffect(() => {
    if (demoMode && !demoRanRef.current) {
      demoRanRef.current = true;
      runTriage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  // In demo mode, expand the handoff band so the clean-pass vs human-accepted
  // distinction is on screen without a click. Outside the demo it stays collapsed.
  useEffect(() => {
    if (demoMode) setRecordsOpen(true);
  }, [demoMode]);

  // Restore the persisted upload queue and review decisions on mount, so an
  // invoice waiting for review survives a reload or a server restart and never
  // has to be re-uploaded.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/uploads");
        if (res.ok) {
          const json = await res.json();
          const ups: StoredUpload[] = json.uploads ?? [];
          if (alive) {
            setUploaded(ups.map((u) => ({ id: u.id, invoice: u.invoice, sourceName: u.sourceName, engine: u.engine, decision: u.decision })));
          }
        }
      } catch {
        /* unreachable store: start with an empty queue */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load the LAST triage run (persisted to disk) and the records handoff on mount.
  // Triage itself does not run here; the queue shows the last result until the
  // user presses Run.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tRes, rRes, dRes] = await Promise.all([fetch("/api/triage"), fetch("/api/records"), fetch("/api/decisions")]);
        if (alive && tRes.ok) {
          const t: PersistedTriage = await tRes.json();
          if (t.result) {
            setData(t.result);
            setLastRunKey(t.batchKey ?? null);
          }
        }
        if (alive && rRes.ok) {
          const r = await rRes.json();
          setRecords(r.records ?? []);
        }
        if (alive && dRes.ok) {
          // Overlay persisted dispositions onto the reloaded result, so an approve
          // or a manual correction survives navigation and restart.
          const dJson = await dRes.json();
          const stored = (dJson.decisions ?? {}) as Record<string, StoredDecision>;
          const dec: Record<string, HumanAction> = {};
          const man: Record<string, { po: string; note: string }> = {};
          for (const [num, sd] of Object.entries(stored)) {
            dec[num] = sd.decision;
            if (sd.decision === "override" && (sd.manualPo || sd.manualNote)) {
              man[num] = { po: sd.manualPo ?? "", note: sd.manualNote ?? "" };
            }
          }
          setDecisions(dec);
          setManualResolutions(man);
        }
      } catch {
        /* no persisted run yet: the queue shows an empty state until Run */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Parse one document's extracted text into a structured invoice and stage it.
  // Used by both the file dropzone and the bundled-sample shortcut.
  const ingestText = useCallback(
    async (text: string, sourceName: string): Promise<UploadNote> => {
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "invoice", text, forceOffline }),
        });
        const json: InvoiceIngestResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not parse this document.");
        setUploaded((prev) => [...prev, { id: json.id, invoice: json.invoice, sourceName, engine: json._meta.engine, decision: null }]);
        const inv = json.invoice;
        const dup = json.duplicate;
        return {
          fileName: sourceName,
          ok: true,
          detail: `${inv.vendor}, $${Math.round(inv.amount).toLocaleString()}${inv.poNumberClaimed ? `, cites ${inv.poNumberClaimed}` : ", no PO cited"}`,
          warn: dup && dup.kind !== "none" ? dupNoteText(dup) : undefined,
        };
      } catch (e: any) {
        return { fileName: sourceName, ok: false, detail: e.message };
      }
    },
    [forceOffline]
  );

  const handleFiles = useCallback(
    async (input: FileList | File[] | null) => {
      const all = input ? Array.from(input) : [];
      if (all.length === 0) return;
      // A folder selection or folder drop carries everything inside it. Keep only
      // the document types the parser reads, and report the rest as skipped rather
      // than failing the whole batch on a .DS_Store or a stray image.
      const files = all.filter((f) => ACCEPTED_INVOICE_RE.test(f.name));
      const skipped = all.length - files.length;
      if (files.length === 0) {
        setUploadNotes([{ fileName: `${all.length} item${all.length === 1 ? "" : "s"} selected`, ok: false, detail: "No PDF, DOCX, or TXT invoices found in that selection." }]);
        return;
      }
      setUploadBusy(true);
      setUploadProgress({ phase: "uploading", fraction: 0, fileCount: files.length });
      setError(null);
      try {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        const { ok, data } = await postFilesWithProgress("/api/upload", form, files.length, setUploadProgress);
        if (!ok) throw new Error(data.error || "Upload failed");
        const fileList = (data.files ?? []) as { fileName: string; ok: boolean; text?: string; error?: string }[];
        const notes: UploadNote[] = [];
        const total = fileList.length;
        let done = 0;
        setUploadProgress({ phase: "processing", fraction: 1, done, total, fileCount: files.length });
        for (const f of fileList) {
          if (!f.ok || !f.text) {
            notes.push({ fileName: f.fileName, ok: false, detail: f.error || "Could not read this file." });
          } else {
            notes.push(await ingestText(f.text, f.fileName));
          }
          done++;
          setUploadProgress({ phase: "processing", fraction: 1, done, total, fileCount: files.length });
        }
        if (skipped > 0) {
          notes.push({ fileName: `${skipped} other file${skipped === 1 ? "" : "s"}`, ok: false, detail: "Skipped: not a PDF, DOCX, or TXT invoice." });
        }
        setUploadNotes(notes);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setUploadBusy(false);
        setUploadProgress(null);
      }
    },
    [ingestText]
  );

  // Load the bundled sample set: a batch of invoices that cite the PO register,
  // added to the queue in one shot (no per-file model parse), then triaged against
  // the full register and persisted, so the table is populated immediately and the
  // deterministic engine resolves most of them by rule. Replaces any prior uploads
  // so the sample loads clean.
  async function loadSampleSet() {
    setUploadBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: SAMPLE_UPLOAD_INVOICES, replace: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the sample set.");
      const ups: StoredUpload[] = json.uploads ?? [];
      setUploaded(ups.map((u) => ({ id: u.id, invoice: u.invoice, sourceName: u.sourceName, engine: u.engine, decision: u.decision })));
      setUploadNotes([{ fileName: `${ups.length} sample invoices`, ok: true, detail: "loaded into the queue, each citing the PO register" }]);
      // Pre-cache the triage: run it now against the full register so the table is
      // populated immediately and persists for the next visit.
      await runTriageBatch([...INVOICES, ...ups.map((u) => u.invoice)], "all");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadBusy(false);
    }
  }

  // Reset to just the seed set: clear every uploaded invoice (and the bottom table
  // with them), then re-run triage on the seed alone so the table returns to the
  // scripted demo rows. This is the "start over" for a batch of uploads.
  async function resetToSeed() {
    await clearUploads();
    await runTriageBatch([...INVOICES], "demo");
  }

  // Persist a review disposition for ANY invoice (seeded or uploaded) to the
  // decision store, keyed by invoice number, so an approve / manual correction
  // survives navigation and restart. `manual` carries the hand-entered PO/note for
  // an override. Passing decision = null reopens (clears) it.
  function persistDecision(invoiceNumber: string, decision: HumanAction | null, manual?: { po: string; note: string }) {
    fetch("/api/decisions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber, decision, manualPo: manual?.po, manualNote: manual?.note }),
    }).catch(() => { /* keep the optimistic local state even if the persist fails */ });
  }

  // Delete one upload: drop it from the queue (re-runs triage) and forget its
  // decision, then remove it server-side (which also removes it from the dedup
  // receipt history, so re-uploading it later is not falsely flagged).
  async function removeUpload(id: string, invoiceNumber: string) {
    setUploaded((prev) => prev.filter((u) => u.id !== id));
    setDecisions((d) => { const n = { ...d }; delete n[invoiceNumber]; return n; });
    setManualResolutions((m) => { const n = { ...m }; delete n[invoiceNumber]; return n; });
    persistDecision(invoiceNumber, null);
    try {
      await fetch(`/api/uploads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch { /* the row is already gone locally; the store reconciles on reload */ }
  }

  async function clearUploads() {
    const upNums = uploaded.map((u) => u.invoice.invoiceNumber);
    setUploaded([]);
    setUploadNotes([]);
    // Clear dispositions for the removed uploads only; seeded-invoice decisions stay.
    setDecisions((d) => { const n = { ...d }; for (const num of upNums) delete n[num]; return n; });
    setManualResolutions((m) => { const n = { ...m }; for (const num of upNums) delete n[num]; return n; });
    upNums.forEach((num) => persistDecision(num, null));
    try {
      await fetch("/api/uploads", { method: "DELETE" });
    } catch { /* local state cleared regardless */ }
  }

  const recordByVendor = new Map(records.map((r) => [normVendor(r.vendor), r]));
  const recordFor = (vendor: string) => recordByVendor.get(normVendor(vendor)) ?? null;

  const results = data?.results ?? [];
  const offline = data?.meta.engine === "offline-deterministic";
  // A duplicate may match a PO cleanly but is still held, so it does not count as
  // auto-cleared.
  const matchedCount = results.filter((r) => r.status === "matched" && !r.duplicate?.isDuplicate).length;
  const exceptions = results.filter((r) => r.needsHuman);
  const openExceptions = exceptions.filter((r) => !decisions[r.invoice.invoiceNumber]).length;
  const backedCount = results.filter((r) => recordFor(r.invoice.vendor)).length;
  const triageSummary = data
    ? `Auto-cleared ${matchedCount} of ${results.length}, ${exceptions.length} need a human, ${backedCount} backed by a committed record.`
    : "";

  // Whether the queue changed since the last persisted run, so we can prompt a
  // re-run without auto-running. An upload or an engine toggle both change this.
  const hasRun = data != null;
  const currentBatchKey = triageBatchKey(forceOffline, [...INVOICES, ...uploaded.map((u) => u.invoice)]);
  const isStale = hasRun && lastRunKey != null && currentBatchKey !== lastRunKey;

  // Find the on-screen match result for an invoice number, so a decision handler
  // can describe what was decided (vendor, amount, why it needed a human) in the
  // audit trail without the caller threading the whole row through.
  function resultFor(invoiceNumber: string): MatchResult | undefined {
    return results.find((r) => r.invoice.invoiceNumber === invoiceNumber);
  }
  // Why this invoice landed in the exception queue, in one short phrase for the
  // audit detail.
  function exceptionReason(r: MatchResult | undefined): string {
    if (!r) return "flagged for review";
    if (r.duplicate?.isDuplicate) return "possible duplicate";
    if (r.status === "no_po") return "no matching PO";
    if (r.status === "over_budget") return "over budget / PO amount";
    if (r.status === "review") return "needs review";
    return "flagged for review";
  }

  function decide(invoiceNumber: string, action: HumanAction) {
    setDecisions((d) => ({ ...d, [invoiceNumber]: action }));
    persistDecision(invoiceNumber, action);
    const r = resultFor(invoiceNumber);
    // Record the human touchpoint: a person accepted the suggested match.
    logAudit({
      module: "BudgetIQ",
      action: "invoice-approved",
      surface: "Invoice check",
      actor: reviewer,
      actionLabel: "Approved suggestion",
      subject: `${invoiceNumber}${r ? ` · ${r.invoice.vendor}` : ""}`,
      outcome: "resolved",
      detail: r
        ? `Reviewer approved the suggested resolution (${poLabel(r)}) for ${usd(r.invoice.amount)}; held for ${exceptionReason(r)}.`
        : "Reviewer approved the suggested resolution.",
    });
  }
  function reopen(invoiceNumber: string) {
    const prior = decisions[invoiceNumber];
    setDecisions((d) => { const n = { ...d }; delete n[invoiceNumber]; return n; });
    setManualResolutions((m) => { const n = { ...m }; delete n[invoiceNumber]; return n; });
    if (manualFor === invoiceNumber) cancelManual();
    persistDecision(invoiceNumber, null);
    const r = resultFor(invoiceNumber);
    // Record the reversal so the trail shows the decision was reopened, not lost.
    logAudit({
      module: "BudgetIQ",
      action: "invoice-reopened",
      surface: "Invoice check",
      actor: reviewer,
      actionLabel: "Reopened",
      subject: `${invoiceNumber}${r ? ` · ${r.invoice.vendor}` : ""}`,
      outcome: "reopened",
      detail: `Reviewer reopened a previously ${prior === "override" ? "manually corrected" : "approved"} exception; it returns to the open queue.`,
    });
  }

  // Open the manual-entry form for an exception the reviewer wants to handle by
  // hand. The decision is NOT recorded until they save, so an accidental click on
  // "handle manually" can be cancelled without dispositioning the row.
  function startManual(invoiceNumber: string) {
    const existing = manualResolutions[invoiceNumber];
    setPoDraft(existing?.po ?? "");
    setNoteDraft(existing?.note ?? "");
    setManualFor(invoiceNumber);
  }
  function cancelManual() {
    setManualFor(null);
    setPoDraft("");
    setNoteDraft("");
  }
  // Save a manual resolution: record the hand-entered PO / note, mark the row as
  // overridden (handled by a human), and close the form. The audit trail and the
  // bottom ledger both read manualResolutions, so the row updates to show the
  // human correction and the PO the reviewer assigned.
  function saveManual(invoiceNumber: string) {
    const po = poDraft.trim();
    const note = noteDraft.trim();
    if (!po && !note) return; // nothing entered yet; keep the form open
    setManualResolutions((m) => ({ ...m, [invoiceNumber]: { po, note } }));
    setDecisions((d) => ({ ...d, [invoiceNumber]: "override" }));
    persistDecision(invoiceNumber, "override", { po, note });
    const r = resultFor(invoiceNumber);
    // Record the human touchpoint: a person took the exception over by hand and
    // entered their own PO / resolution. Capture exactly what they assigned.
    logAudit({
      module: "BudgetIQ",
      action: "invoice-corrected",
      surface: "Invoice check",
      actor: reviewer,
      actionLabel: "Manual correction",
      subject: `${invoiceNumber}${r ? ` · ${r.invoice.vendor}` : ""}`,
      outcome: "resolved",
      detail: [
        `Reviewer handled this manually${r ? ` (${usd(r.invoice.amount)}, held for ${exceptionReason(r)})` : ""}.`,
        po ? `Assigned ${po}.` : "",
        note ? `Note: ${note}` : "",
      ].filter(Boolean).join(" "),
    });
    cancelManual();
  }

  function poLabel(r: MatchResult): string {
    return r.matchedPo ? `${r.matchedPo.poNumber} / ${r.matchedPo.workOrder}` : "(unresolved)";
  }

  // The effective "resolved by" badge, PO, and resolved-state for the ledger,
  // folding in any human disposition. A row a reviewer approved reads as resolved
  // by a human; a row handled manually reads as a manual correction and shows the
  // hand-entered PO. Untouched rows fall back to the deterministic / AI result, so
  // the bottom list updates the moment a human acts on an exception.
  function rowResolution(r: MatchResult): { srcBg: string; srcFg: string; srcLabel: string; po: string; resolved: boolean } {
    const dec = decisions[r.invoice.invoiceNumber];
    if (dec === "approved") {
      const s = srcStyle("human");
      return { srcBg: s.srcBg, srcFg: s.srcFg, srcLabel: "human", po: poLabel(r), resolved: true };
    }
    if (dec === "override") {
      const m = manualResolutions[r.invoice.invoiceNumber];
      // Show the original machine source plus the human override, e.g. "rule/manual".
      const orig = srcStyle(r.resolutionSource);
      return { srcBg: "#e9f4ef", srcFg: "#1f7a5a", srcLabel: `${orig.label}/manual`, po: m?.po ? m.po : poLabel(r), resolved: true };
    }
    const s = srcStyle(r.resolutionSource);
    return { srcBg: s.srcBg, srcFg: s.srcFg, srcLabel: s.label, po: poLabel(r), resolved: false };
  }

  function doExport(fmt: ExportFormat) {
    const header = ["Invoice", "Vendor", "Amount", "PO / WO", "Resolved by", "Confidence", "Status"];
    const rows = results.map((r) => {
      const rr = rowResolution(r);
      return [
        r.invoice.invoiceNumber,
        r.invoice.vendor,
        usd(r.invoice.amount),
        rr.po,
        rr.srcLabel,
        pct(r.confidence),
        rr.resolved ? "resolved" : STATUS_STYLE[r.status].label,
      ];
    });
    const sheet: Sheet = { name: "Invoice matching", rows: [header, ...rows] };
    exportSheets([sheet], fmt, "procureiq-invoices");
    setExportOpen(false);
  }

  const btn: CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 600 };
  const headerCell: CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 20 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>BudgetIQ, Invoice matching</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: 0, color: "#16202e" }}>Invoice to PO matching</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setExportOpen((v) => !v)} disabled={!data || results.length === 0} style={{ ...btn, display: "flex", alignItems: "center", gap: 7, opacity: !data || results.length === 0 ? 0.55 : 1 }}>
              Export<span style={{ color: "#9aa3b0", fontSize: 8 }}>&#9660;</span>
            </button>
            {exportOpen && (
              <>
                <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #e6e8ec", borderRadius: 9, boxShadow: "0 10px 28px rgba(20,30,45,.13)", zIndex: 40, minWidth: 182, overflow: "hidden" }}>
                  <div className="pq-menu-item" onClick={() => doExport("csv")} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f1f3f5" }}>
                    <span className="mono" style={{ fontSize: 10, color: "#5a7290", fontWeight: 600, width: 30 }}>CSV</span><span style={{ fontSize: 12.5, color: "#2a3645" }}>Comma-separated</span>
                  </div>
                  <div className="pq-menu-item" onClick={() => doExport("xlsx")} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ fontSize: 10, color: "#1f7a5a", fontWeight: 600, width: 30 }}>XLSX</span><span style={{ fontSize: 12.5, color: "#2a3645" }}>Excel workbook</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => runTriage()} disabled={loading} style={{ ...btn, ...((!hasRun || isStale) && !loading ? { background: "var(--accent)", color: "#fff", border: "none" } : {}), opacity: loading ? 0.6 : 1 }}>{loading ? "Running…" : hasRun ? "Re-run triage" : "Run triage"}</button>
        </div>
      </div>

      {/* upload invoice PDFs (the AP intake step Ben described, automated) */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", marginBottom: 4 }}>Upload invoices</div>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.5 }}>
              Instead of re-keying them into Points Purchasing, drop invoices here. Drop or choose several at once, or a whole folder, and each is parsed once then matched to a PO and work order through the queue below.
            </div>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              // Resolve the drop (descending into any dropped folder) to a flat
              // File[] before handing it to the uploader.
              filesFromDataTransfer(e.dataTransfer).then((files) => handleFiles(files));
            }}
            style={{ flex: 1, minWidth: 280, border: `1.5px dashed ${dragging ? "var(--accent)" : "#d4d9e0"}`, borderRadius: 9, padding: "14px 14px", textAlign: "center", background: dragging ? "#f4faf7" : "#fafbfc", cursor: "pointer" }}
          >
            {uploadBusy && uploadProgress ? (
              <UploadProgress state={uploadProgress} />
            ) : (
              <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
                Drop invoices or a folder, or click to choose.<br /><span style={{ fontSize: 10.5, color: "#a3abb6" }}>PDF, DOCX, TXT &middot; multiple files or a folder</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose files</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose folder</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); loadSampleSet(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Try a sample</button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.text,.md,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            {/* Folder picker. The webkitdirectory/directory attributes are set on
                this input in an effect (they are not typed React props). */}
            <input ref={folderRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
        {uploadNotes.length > 0 && (
          <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            {uploadNotes.map((n, i) => (
              <div key={`${n.fileName}-${i}`} style={{ fontSize: 11.5, color: n.ok ? "#5a6675" : "#b23b3b", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{n.fileName}</span>{" "}
                {n.ok ? <span style={{ color: "#1f7a5a" }}>parsed: {n.detail}</span> : <span>{n.detail}</span>}
                {n.warn && <span style={{ color: "#9a6b00" }}> &middot; {n.warn}</span>}
              </div>
            ))}
          </div>
        )}
        {uploaded.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f3f5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 600 }}>{uploaded.length} uploaded invoice{uploaded.length === 1 ? "" : "s"} in the queue</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#e9f4ef", color: "#1f7a5a" }}>saved, survives restart</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: uploaded.some((u) => u.engine === "live") ? "#ece9f9" : "#f1f3f5", color: uploaded.some((u) => u.engine === "live") ? "#5b54a3" : "#5a6675" }}>
                {uploaded.some((u) => u.engine === "live") ? "parsed by model" : "parsed offline"}
              </span>
              <button onClick={resetToSeed} title="Remove all uploaded invoices and return the table to the seed set" style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e7ee", background: "#fff", color: "#7a8493", fontSize: 11, fontWeight: 600 }}>Reset to seed</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {uploaded.map((u) => {
                const dec = decisions[u.invoice.invoiceNumber];
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 7 }}>
                    <span className="mono" style={{ fontSize: 11, color: "#5a6675", whiteSpace: "nowrap" }}>{u.invoice.invoiceNumber}</span>
                    <span style={{ fontSize: 11.5, color: "#2a3645", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{u.invoice.vendor}</span>
                    <span className="num" style={{ fontSize: 11.5, color: "#5a6675", whiteSpace: "nowrap" }}>{usd(u.invoice.amount)}</span>
                    <span style={{ fontSize: 10.5, color: "#9aa3b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{u.sourceName}</span>
                    {dec && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a", whiteSpace: "nowrap" }}>{dec === "approved" ? "approved" : "handled"}</span>}
                    <button onClick={() => removeUpload(u.id, u.invoice.invoiceNumber)} title="Delete this upload" style={{ marginLeft: "auto", flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: "1px solid #e2e7ee", background: "#fff", color: "#b23b3b", fontSize: 13, fontWeight: 600, lineHeight: 1, cursor: "pointer" }}>&times;</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* record handoff: collapsed by default, expand to inspect or remove records */}
      <div style={{ background: "#f2f7f4", border: "1px solid #d7e8df", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setRecordsOpen((o) => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ color: "var(--accent)", fontSize: 12 }}>&#9678;</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1f6a50" }}>Matched against the record ContractIQ extracted</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#3f8a6c", background: "#e2efe8", borderRadius: 20, padding: "1px 9px" }}>{records.length}</span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#6a9a86", transform: recordsOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>&#9662;</span>
        </button>
        {recordsOpen && (
          <div style={{ marginTop: 12 }}>
            {records.length > 0 ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {records.map((r) => {
                  const cl = r.clearance;
                  const human = cl?.status === "human-accepted";
                  return (
                    <div key={r.id} style={{ background: "#fff", border: "1px solid #e2ece6", borderRadius: 9, padding: "11px 15px", minWidth: 224 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>{r.vendor ?? "–"}</div>
                          {cl && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: human ? "#fdf3e3" : "#e9f4ef", color: human ? "#9a6b1a" : "#1f7a5a", border: `1px solid ${human ? "#f0e0c2" : "#cfe3d8"}`, alignSelf: "flex-start" }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: human ? "#c98a2a" : "#2f9e78" }} />
                              {human ? "Human accepted" : "Clean pass"}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecord(r.id)}
                          disabled={removingId === r.id}
                          title="Remove this committed record"
                          style={{ flexShrink: 0, border: "none", background: "transparent", color: "#b6bfc9", fontSize: 13, fontWeight: 600, lineHeight: 1, padding: 2, cursor: removingId === r.id ? "default" : "pointer" }}
                        >
                          {removingId === r.id ? "…" : "✕"}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "#8893a2", lineHeight: 1.6 }}>
                        <span className="mono" style={{ color: "#5a6675" }}>{r.extraction.paymentSchedule ?? "schedule n/a"}</span><br />
                        total <span className="num" style={{ color: "#5a6675" }}>{r.extraction.totalValue != null ? usd(r.extraction.totalValue) : "n/a"}</span> &middot; {r.sourceName}
                      </div>
                      {human && cl && (
                        <div style={{ marginTop: 7, fontSize: 10.5, color: "#9a6b1a", lineHeight: 1.45 }}>
                          {cl.flags} {cl.flags === 1 ? "flag" : "flags"} accepted by an attorney before this crossed over.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "#6a9a86", lineHeight: 1.5 }}>
                No contract records committed yet. Run a review in ContractIQ and commit it, then these invoices show the live handoff. Until then the queue runs off the seeded POs.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fdf6f6", border: "1px solid #f0d4d4", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b23b3b", marginBottom: 16 }}>{error}</div>
      )}

      {/* engine + summary (shown once a run exists) */}
      {data && (
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 15, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 7, background: offline ? "#f1f3f5" : "#e9f4ef", border: `1px solid ${offline ? "#e3e6ea" : "#cfe3d8"}` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: offline ? "#9aa3b0" : "#2f9e78" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: offline ? "#5a6675" : "#1f7a5a" }}>{offline ? "Offline deterministic" : "Live"}</span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "#9aa3b0" }}>{offline ? "no model call" : data.meta.model} · {data.meta.latencyMs} ms</span>
          {isStale && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "#fbf4e3", color: "#9a6b00" }}>queue changed since this run</span>}
          <span style={{ fontSize: 12.5, color: "#5a6675", marginLeft: "auto" }}>{loading ? "Running triage…" : triageSummary}</span>
        </div>
      )}

      {/* run prompt: triage runs only on Run. Shown when nothing has run yet, or
          the queue changed (an upload or an engine switch) since the shown result. */}
      {!loading && (!hasRun || isStale) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fbf7ec", border: "1px solid #ecdcb6", borderRadius: 9, padding: "12px 15px", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: "#7a5b1a", lineHeight: 1.5 }}>
            {hasRun
              ? "The queue changed since this result was produced (an upload or an engine switch). Run triage to update it."
              : "No triage has run on this queue yet. Add any invoices, then run triage to match them."}
          </span>
          <button onClick={() => runTriage()} style={{ marginLeft: "auto", flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{hasRun ? "Re-run triage" : "Run triage"}</button>
        </div>
      )}

      {/* first-run loading indicator (no prior result to show) */}
      {loading && !data && (
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "22px 18px", marginBottom: 16, fontSize: 12.5, color: "#7a8493" }}>Running triage…</div>
      )}

      {/* exception queue (the actionable items, surfaced above the full ledger) */}
      {exceptions.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "#16202e" }}>Exception queue</h3>
            <span style={{ fontSize: 11.5, color: "#9aa3b0", padding: "2px 9px", borderRadius: 6, background: "#f1f3f5" }}>{openExceptions} need a human</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {exceptions.map((r) => {
              const ss = STATUS_STYLE[r.status];
              const dec = decisions[r.invoice.invoiceNumber];
              const man = manualResolutions[r.invoice.invoiceNumber];
              const decMap = {
                approved: { label: "Approved", bg: "#e9f4ef", fg: "#1f7a5a" },
                override: { label: "Handled manually", bg: "#f1f3f5", fg: "#5a6675" },
              } as const;
              return (
                <div key={r.invoice.invoiceNumber} style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 19 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 11.5, color: "#5a6675" }}>{r.invoice.invoiceNumber}</span>
                    <span className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38" }}>{r.invoice.vendor}</span>
                    <span className="num" style={{ fontSize: 12.5, color: "#5a6675" }}>{usd(r.invoice.amount)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: ss.stBg, color: ss.stFg }}>{ss.label}</span>
                  </div>
                  {r.duplicate && r.duplicate.kind !== "none" && (() => {
                    const d = r.duplicate!;
                    const dt = dupTag(d.kind);
                    const risk = d.isDuplicate;
                    return (
                      <div style={{ background: risk ? "#fdf6f6" : "#fbfaf4", border: `1px solid ${risk ? "#f0d4d4" : "#ece4cf"}`, borderRadius: 9, padding: "11px 14px", marginBottom: 13 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                          {dt && <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: dt.bg, color: dt.fg, textTransform: "uppercase", letterSpacing: ".3px" }}>{dt.label}</span>}
                          <span style={{ fontSize: 11, fontWeight: 600, color: risk ? "#b23b3b" : "#9a6b00" }}>Deterministic dedup check</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#e7eefb", color: "#2e6da4" }}>rule</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#5a6675", lineHeight: 1.5 }}>{d.recommendation}</div>
                        {d.matches.length > 0 && (
                          <div className="mono" style={{ fontSize: 10.5, color: "#8893a2", marginTop: 6 }}>
                            {d.matches.length === 1 ? "Prior receipt: " : "Prior receipts: "}{d.matches.map((m) => m.invoiceNumber).join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ fontSize: 12.5, color: "#5a6675", lineHeight: 1.5, marginBottom: 13 }}>{r.explanation}</div>

                  {r.suggestedResolution && (
                    <div style={{ background: "#f4f6f9", border: "1px solid #e2e7ee", borderRadius: 9, padding: "12px 14px", marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600, marginBottom: 5 }}>Suggested resolution</div>
                      <div style={{ fontSize: 12.5, color: "#2a3645", lineHeight: 1.5 }}>{r.suggestedResolution}</div>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600, marginBottom: 9 }}>Audit trail</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {r.audit.map((a, i) => {
                        const sr = srcStyle(a.source);
                        const last = i === r.audit.length - 1 && !dec;
                        return (
                          <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                              <span style={{ width: 9, height: 9, borderRadius: "50%", background: sr.dot, marginTop: 3 }} />
                              {!last && <span style={{ width: 1.5, flex: 1, background: "#e6e8ec", minHeight: 16 }} />}
                            </div>
                            <div style={{ flex: 1, paddingBottom: 11 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#2a3645" }}>{a.label}</span>
                                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: sr.srcBg, color: sr.srcFg }}>{sr.label}</span>
                                {a.confidence != null && <span className="num" style={{ fontSize: 10.5, color: "#9aa3b0" }}>{pct(a.confidence)}</span>}
                              </div>
                              <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>{a.detail}</div>
                            </div>
                          </div>
                        );
                      })}
                      {dec && (
                        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2f9e78", marginTop: 3 }} />
                          </div>
                          <div style={{ flex: 1, paddingBottom: 11 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#2a3645" }}>Human decision</span>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a" }}>{dec === "override" ? "manual correction" : "human"}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>
                              {dec === "override"
                                ? `Reviewer took this over manually${man?.po ? ` and assigned ${man.po}` : ""}.${man?.note ? ` ${man.note}` : ""}`
                                : "Reviewer approved the suggestion."}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9, paddingTop: 13, borderTop: "1px solid #f1f3f5" }}>
                    {!dec && manualFor !== r.invoice.invoiceNumber && (
                      <div style={{ display: "flex", gap: 9 }}>
                        <button onClick={() => decide(r.invoice.invoiceNumber, "approved")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600 }}>Approve suggestion</button>
                        <button onClick={() => startManual(r.invoice.invoiceNumber)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12, fontWeight: 600 }}>Override, handle manually</button>
                      </div>
                    )}
                    {!dec && manualFor === r.invoice.invoiceNumber && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                        <div style={{ fontSize: 11, color: "#7a8493", lineHeight: 1.5 }}>
                          Enter the PO / work order you are assigning by hand, or a short note on how you resolved this. It is recorded as a manual correction on the audit trail and the ledger below.
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <input
                            value={poDraft}
                            onChange={(e) => setPoDraft(e.target.value)}
                            placeholder="PO / work order, e.g. PO-4821 / WO-12"
                            className="mono"
                            style={{ flex: "0 0 240px", padding: "8px 11px", borderRadius: 8, border: "1px solid #d8dde4", fontSize: 12, color: "#2a3645" }}
                            onKeyDown={(e) => { if (e.key === "Enter") saveManual(r.invoice.invoiceNumber); }}
                          />
                          <input
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Resolution note (optional)"
                            style={{ flex: 1, minWidth: 200, padding: "8px 11px", borderRadius: 8, border: "1px solid #d8dde4", fontSize: 12, color: "#2a3645" }}
                            onKeyDown={(e) => { if (e.key === "Enter") saveManual(r.invoice.invoiceNumber); }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 9 }}>
                          <button onClick={() => saveManual(r.invoice.invoiceNumber)} disabled={!poDraft.trim() && !noteDraft.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, opacity: !poDraft.trim() && !noteDraft.trim() ? 0.55 : 1 }}>Save resolution</button>
                          <button onClick={cancelManual} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12, fontWeight: 600 }}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {dec && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 8, background: decMap[dec].bg, color: decMap[dec].fg, fontSize: 12, fontWeight: 600 }}>
                            {decMap[dec].label}<span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,.07)" }}>{dec === "override" ? "manual correction" : "human"}</span>
                          </span>
                          <button onClick={() => reopen(r.invoice.invoiceNumber)} style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: "transparent", color: "#9aa3b0", fontSize: 11.5, fontWeight: 500, textDecoration: "underline" }}>Reopen</button>
                        </div>
                        {dec === "override" && man && (man.po || man.note) && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#5a6675", lineHeight: 1.5, flexWrap: "wrap" }}>
                            {man.po && <span className="mono" style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "#eef1fb", color: "#3a5fb0" }}>{man.po}</span>}
                            {man.note && <span>{man.note}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* full invoice ledger (all rows, below the actionable exception queue) */}
      {data && (
        <>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, margin: "30px 0 14px", color: "#16202e" }}>All invoices</h3>
          <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden", marginBottom: 26 }}>
            <div style={{ display: "grid", gridTemplateColumns: TRIAGE_COLS, columnGap: 18, padding: "11px 18px", background: "#fafbfc", borderBottom: "1px solid #eef0f3" }}>
              <div style={headerCell}>Invoice</div>
              <div style={headerCell}>Vendor</div>
              <div style={{ ...headerCell, textAlign: "right" }}>Amount</div>
              <div style={headerCell}>PO / WO</div>
              <div style={headerCell}>Resolved by</div>
              <div style={{ ...headerCell, textAlign: "right" }}>Conf.</div>
              <div style={{ ...headerCell, textAlign: "right" }}>Status</div>
            </div>
            {results.map((r) => {
              const ss = STATUS_STYLE[r.status];
              const rr = rowResolution(r);
              const backed = !!recordFor(r.invoice.vendor);
              const fromUpload = uploadedNums.has(r.invoice.invoiceNumber);
              return (
                <div key={r.invoice.invoiceNumber} style={{ display: "grid", gridTemplateColumns: TRIAGE_COLS, columnGap: 18, padding: "var(--row-pad)", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
                  <div className="mono" style={{ color: "#5a6675", fontSize: 11.5 }}>{r.invoice.invoiceNumber}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ color: "#2a3645", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.invoice.vendor}</span>
                    {fromUpload && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#eef1fb", color: "#3a5fb0", whiteSpace: "nowrap", flexShrink: 0 }}>uploaded</span>}
                    {backed && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a", whiteSpace: "nowrap", flexShrink: 0 }}>record</span>}
                    {(() => {
                      const dt = r.duplicate ? dupTag(r.duplicate.kind) : null;
                      return dt ? <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: dt.bg, color: dt.fg, whiteSpace: "nowrap", flexShrink: 0 }}>{dt.label}</span> : null;
                    })()}
                  </div>
                  <div className="num" style={{ textAlign: "right", color: "#2a3645" }}>{usd(r.invoice.amount)}</div>
                  <div className="mono" style={{ color: "#6a7484", fontSize: 11.5 }}>{rr.po}</div>
                  <div><span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: rr.srcBg, color: rr.srcFg, whiteSpace: "nowrap" }}>{rr.srcLabel}</span></div>
                  <div className="num" style={{ textAlign: "right", color: rr.resolved ? "#1f7a5a" : confColor(r.status), fontWeight: 500 }}>{pct(r.confidence)}</div>
                  <div style={{ textAlign: "right" }}>
                    {rr.resolved
                      ? <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: "#e9f4ef", color: "#1f7a5a", whiteSpace: "nowrap" }}>resolved</span>
                      : <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: ss.stBg, color: ss.stFg, whiteSpace: "nowrap" }}>{ss.label}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
