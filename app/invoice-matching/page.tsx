"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { DecisionSource, HumanAction, Invoice, InvoiceIngestResponse, MatchResult, MatchStatus, StoredUpload, TriageResponse } from "@/lib/types";
import { DuplicateCheck, DuplicateKind } from "@/lib/dedup";
import { INVOICES, SAMPLE_INVOICE_PDF_TEXT } from "@/lib/mockData";
import { exportSheets, ExportFormat, Sheet } from "@/lib/export";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { useEngine } from "../components/engine";
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

interface SharedRecordLite {
  id: string;
  vendor: string | null;
  sourceName: string;
  extraction: { paymentSchedule: string | null; totalValue: number | null };
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

const TRIAGE_COLS = "1fr 1.6fr .85fr .9fr .9fr .65fr .95fr";

// Triage is the expensive step: in Live mode it calls the model. Cache the last
// result for a given engine + batch so reopening the page (client navigation, or
// a reload) reuses it instead of re-running. The key is the batch contents, so
// any upload or an engine toggle is a cache miss and re-runs; the "Re-run triage"
// button forces a fresh run. sessionStorage backs the in-memory cache so a full
// reload reuses it too.
let triageMemoCache: { key: string; data: TriageResponse } | null = null;
const TRIAGE_CACHE_STORAGE_KEY = "pq-triage-cache";

function triageBatchKey(forceOffline: boolean, batch: Invoice[]): string {
  const sig = batch.map((i) => `${i.invoiceNumber}|${i.vendor}|${i.amount}|${i.poNumberClaimed ?? ""}`).join("~");
  return `${forceOffline ? "offline" : "live"}::${sig}`;
}

function readTriageCache(key: string): TriageResponse | null {
  if (triageMemoCache?.key === key) return triageMemoCache.data;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRIAGE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; data: TriageResponse };
    if (parsed.key === key) {
      triageMemoCache = parsed;
      return parsed.data;
    }
  } catch {
    /* ignore unreadable cache */
  }
  return null;
}

function writeTriageCache(key: string, data: TriageResponse): void {
  triageMemoCache = { key, data };
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TRIAGE_CACHE_STORAGE_KEY, JSON.stringify({ key, data }));
  } catch {
    /* sessionStorage may be unavailable or full; the in-memory cache still holds */
  }
}

export default function InvoiceMatchingPage() {
  const { forceOffline } = useEngine();

  const [data, setData] = useState<TriageResponse | null>(null);
  const [records, setRecords] = useState<SharedRecordLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, HumanAction>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [uploaded, setUploaded] = useState<UploadedInvoice[]>([]);
  const [uploadNotes, setUploadNotes] = useState<UploadNote[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadedNums = new Set(uploaded.map((u) => u.invoice.invoiceNumber));

  // The triage batch is the seeded queue plus anything uploaded this session.
  // Sending the full batch (not just the uploads) keeps the demo queue intact
  // while the parsed PDF flows through the exact same deterministic + AI match.
  //
  // The records read is cheap and always runs so the handoff stays current. The
  // triage call is the expensive one, so on a cache hit (same engine + batch) we
  // reuse the stored result instead of re-running. `force` (the "Re-run triage"
  // button) skips the cache and always calls the model.
  const runTriage = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const batch: Invoice[] = [...INVOICES, ...uploaded.map((u) => u.invoice)];
    const key = triageBatchKey(forceOffline, batch);
    try {
      // The records handoff is cheap; refresh it every time regardless of cache.
      const recPromise = fetch("/api/records");

      const cached = force ? null : readTriageCache(key);
      if (cached) {
        setData(cached);
        const recRes = await recPromise;
        if (recRes.ok) {
          const recJson = await recRes.json();
          setRecords(recJson.records ?? []);
        }
        return;
      }

      const triageRes = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: batch, forceOffline }),
      });
      const json = await triageRes.json();
      if (!triageRes.ok) throw new Error(json.error || "Triage failed");
      writeTriageCache(key, json);
      setData(json);
      const recRes = await recPromise;
      if (recRes.ok) {
        const recJson = await recRes.json();
        setRecords(recJson.records ?? []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [forceOffline, uploaded]);

  // Restore the persisted upload queue and review decisions on mount, so an
  // invoice waiting for review survives a reload or a server restart and never
  // has to be re-uploaded. Triage runs once this hydration completes.
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
            const seeded: Record<string, HumanAction> = {};
            for (const u of ups) if (u.decision) seeded[u.invoice.invoiceNumber] = u.decision;
            setDecisions(seeded);
          }
        }
      } catch {
        /* unreachable store: start with an empty queue */
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (hydrated) runTriage(); }, [runTriage, hydrated]);

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
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadBusy(true);
      setUploadProgress({ phase: "uploading", fraction: 0, fileCount: files.length });
      setError(null);
      try {
        const form = new FormData();
        Array.from(files).forEach((f) => form.append("files", f));
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

  async function loadSampleInvoice() {
    setUploadBusy(true);
    setError(null);
    const note = await ingestText(SAMPLE_INVOICE_PDF_TEXT, "Sample invoice (Clarivue).pdf");
    setUploadNotes([note]);
    setUploadBusy(false);
  }

  // Persist a review decision for an UPLOADED row (seeded demo rows have no
  // upload id and stay client-only). We do not touch the `uploaded` array here:
  // that would re-trigger triage on every approve. The server holds the decision,
  // and on reload hydration re-seeds it. Local `decisions` state is the in-session
  // source of truth and is no longer reset on a triage re-run.
  function persistDecision(invoiceNumber: string, decision: HumanAction | null) {
    const up = uploaded.find((u) => u.invoice.invoiceNumber === invoiceNumber);
    if (!up) return;
    fetch("/api/uploads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: up.id, decision }),
    }).catch(() => { /* keep the optimistic local state even if the persist fails */ });
  }

  // Delete one upload: drop it from the queue (re-runs triage) and forget its
  // decision, then remove it server-side (which also removes it from the dedup
  // receipt history, so re-uploading it later is not falsely flagged).
  async function removeUpload(id: string, invoiceNumber: string) {
    setUploaded((prev) => prev.filter((u) => u.id !== id));
    setDecisions((d) => { const n = { ...d }; delete n[invoiceNumber]; return n; });
    try {
      await fetch(`/api/uploads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch { /* the row is already gone locally; the store reconciles on reload */ }
  }

  async function clearUploads() {
    setUploaded([]);
    setUploadNotes([]);
    setDecisions({});
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

  function decide(invoiceNumber: string, action: HumanAction) {
    setDecisions((d) => ({ ...d, [invoiceNumber]: action }));
    persistDecision(invoiceNumber, action);
  }
  function reopen(invoiceNumber: string) {
    setDecisions((d) => { const n = { ...d }; delete n[invoiceNumber]; return n; });
    persistDecision(invoiceNumber, null);
  }

  function poLabel(r: MatchResult): string {
    return r.matchedPo ? `${r.matchedPo.poNumber} / ${r.matchedPo.workOrder}` : "(unresolved)";
  }

  function doExport(fmt: ExportFormat) {
    const header = ["Invoice", "Vendor", "Amount", "PO / WO", "Resolved by", "Confidence", "Status"];
    const rows = results.map((r) => [
      r.invoice.invoiceNumber,
      r.invoice.vendor,
      usd(r.invoice.amount),
      poLabel(r),
      srcStyle(r.resolutionSource).label,
      pct(r.confidence),
      STATUS_STYLE[r.status].label,
    ]);
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
          <button onClick={() => runTriage(true)} disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>{loading ? "Running…" : "Re-run triage"}</button>
        </div>
      </div>

      {/* upload invoice PDFs (the AP intake step Ben described, automated) */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", marginBottom: 4 }}>Upload an invoice PDF</div>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.5 }}>
              Instead of re-keying it into Points Purchasing, drop the PDF here. It is parsed once, then matched to a PO and work order through the same queue below.
            </div>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            style={{ flex: 1, minWidth: 280, border: `1.5px dashed ${dragging ? "var(--accent)" : "#d4d9e0"}`, borderRadius: 9, padding: "14px 14px", textAlign: "center", background: dragging ? "#f4faf7" : "#fafbfc", cursor: "pointer" }}
          >
            {uploadBusy && uploadProgress ? (
              <UploadProgress state={uploadProgress} />
            ) : (
              <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
                Drop an invoice or click to choose.<br /><span style={{ fontSize: 10.5, color: "#a3abb6" }}>PDF, DOCX, TXT</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 9 }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose file</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); loadSampleInvoice(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Try a sample</button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.text,.md,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
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
              <button onClick={clearUploads} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e7ee", background: "#fff", color: "#7a8493", fontSize: 11, fontWeight: 600 }}>Clear all</button>
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

      {/* record handoff */}
      <div style={{ background: "#f2f7f4", border: "1px solid #d7e8df", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: records.length ? 12 : 0 }}>
          <span style={{ color: "var(--accent)", fontSize: 12 }}>&#9678;</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1f6a50" }}>Matched against the record ContractIQ extracted</span>
        </div>
        {records.length > 0 ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {records.map((r) => (
              <div key={r.id} style={{ background: "#fff", border: "1px solid #e2ece6", borderRadius: 9, padding: "11px 15px", minWidth: 210 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38", marginBottom: 5 }}>{r.vendor ?? "–"}</div>
                <div style={{ fontSize: 11, color: "#8893a2", lineHeight: 1.6 }}>
                  <span className="mono" style={{ color: "#5a6675" }}>{r.extraction.paymentSchedule ?? "schedule n/a"}</span><br />
                  total <span className="num" style={{ color: "#5a6675" }}>{r.extraction.totalValue != null ? usd(r.extraction.totalValue) : "n/a"}</span> &middot; {r.sourceName}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#6a9a86", lineHeight: 1.5 }}>
            No contract records committed yet. Run a review in ContractIQ and commit it, then these invoices show the live handoff. Until then the queue runs off the seeded POs.
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fdf6f6", border: "1px solid #f0d4d4", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b23b3b", marginBottom: 16 }}>{error}</div>
      )}

      {/* engine + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 15, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 7, background: offline ? "#f1f3f5" : "#e9f4ef", border: `1px solid ${offline ? "#e3e6ea" : "#cfe3d8"}` }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: offline ? "#9aa3b0" : "#2f9e78" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: offline ? "#5a6675" : "#1f7a5a" }}>{offline ? "Offline deterministic" : "Live"}</span>
        </div>
        {data && <span className="mono" style={{ fontSize: 11, color: "#9aa3b0" }}>{offline ? "no model call" : data.meta.model} · {data.meta.latencyMs} ms</span>}
        <span style={{ fontSize: 12.5, color: "#5a6675", marginLeft: "auto" }}>{loading && !data ? "Running triage…" : triageSummary}</span>
      </div>

      {/* table */}
      {data && (
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden", marginBottom: 26 }}>
          <div style={{ display: "grid", gridTemplateColumns: TRIAGE_COLS, padding: "11px 18px", background: "#fafbfc", borderBottom: "1px solid #eef0f3" }}>
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
            const sr = srcStyle(r.resolutionSource);
            const backed = !!recordFor(r.invoice.vendor);
            const fromUpload = uploadedNums.has(r.invoice.invoiceNumber);
            return (
              <div key={r.invoice.invoiceNumber} style={{ display: "grid", gridTemplateColumns: TRIAGE_COLS, padding: "var(--row-pad)", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
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
                <div className="mono" style={{ color: "#6a7484", fontSize: 11.5 }}>{poLabel(r)}</div>
                <div><span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: sr.srcBg, color: sr.srcFg }}>{sr.label}</span></div>
                <div className="num" style={{ textAlign: "right", color: confColor(r.status), fontWeight: 500 }}>{pct(r.confidence)}</div>
                <div style={{ textAlign: "right" }}><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: ss.stBg, color: ss.stFg, whiteSpace: "nowrap" }}>{ss.label}</span></div>
              </div>
            );
          })}
        </div>
      )}

      {/* exception queue */}
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
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a" }}>human</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>Reviewer {dec === "approved" ? "approved the suggestion" : "took this over manually"}.</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 9, paddingTop: 13, borderTop: "1px solid #f1f3f5" }}>
                    {!dec ? (
                      <div style={{ display: "flex", gap: 9 }}>
                        <button onClick={() => decide(r.invoice.invoiceNumber, "approved")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600 }}>Approve suggestion</button>
                        <button onClick={() => decide(r.invoice.invoiceNumber, "override")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12, fontWeight: 600 }}>Override, handle manually</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 8, background: decMap[dec].bg, color: decMap[dec].fg, fontSize: 12, fontWeight: 600 }}>
                          {decMap[dec].label}<span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,.07)" }}>human</span>
                        </span>
                        <button onClick={() => reopen(r.invoice.invoiceNumber)} style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: "transparent", color: "#9aa3b0", fontSize: 11.5, fontWeight: 500, textDecoration: "underline" }}>Reopen</button>
                      </div>
                    )}
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
