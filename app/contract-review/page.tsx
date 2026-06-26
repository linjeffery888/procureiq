"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_CONTRACT, SAMPLE_CONTRACT_2, SAMPLE_CHANGE_ORDER } from "@/lib/mockData";
import { ExtractionResponse, Severity, LinkStatus } from "@/lib/types";
import { resolveContractFamilies } from "@/lib/contractLinking";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { useEngine } from "../components/engine";
import { UploadProgress } from "../components/UploadProgress";

// ContractIQ, first-pass contract review. Ported to the approved design comp: a
// sticky left input column (load a contract or a bundled sample, precedent
// grounding toggle, run) and a right results column (engine badge + tally,
// grounding evidence, extracted fields, consistency checks, playbook findings
// with attorney disposition, the downstream handoff, and commit). The wiring is
// the real product: /api/extract reads the contract, /api/upload extracts file
// text, /api/records commits the shared ContractExtraction that BudgetIQ reads.

const SEVERITY_RANK: Record<Severity, number> = { flag: 0, review: 1, ok: 2 };

// The three consistency checks rendered as their own strip, separate from the
// clause findings, when the engine returns them.
const CONSISTENCY_KEYS = new Set(["invoice_schedule_math", "key_dates", "corporate_address"]);

type Disposition = "accepted" | "dismissed";

interface UploadRow {
  fileName: string;
  ok: boolean;
  note?: string;
  kind?: string;
  text?: string;
  error?: string;
}

// One contract's slot in a batch review. result is null while the row is still
// queued/in-flight, or when the review failed (error is then set).
interface BatchRow {
  fileName: string;
  text: string;
  result: ExtractionResponse | null;
  error: string | null;
}

// Worst severity present drives the row's status badge. A queued/failed row has
// no result yet.
function batchSeverity(row: BatchRow): Severity | null {
  if (!row.result) return null;
  if (row.result.findings.some((f) => f.severity === "flag")) return "flag";
  if (row.result.findings.some((f) => f.severity === "review")) return "review";
  return "ok";
}

interface SevStyle {
  sevBg: string;
  sevFg: string;
  accent: string;
  dot: string;
  border: string;
  bg: string;
}

function sevStyle(sev: Severity): SevStyle {
  if (sev === "flag") return { sevBg: "#fbecec", sevFg: "#b23b3b", accent: "#cf5b5b", dot: "#cf5b5b", border: "#f0d4d4", bg: "#fdf6f6" };
  if (sev === "review") return { sevBg: "#fbf4e3", sevFg: "#9a6b00", accent: "#d3a52a", dot: "#c79212", border: "#efe2c3", bg: "#fdfaf2" };
  return { sevBg: "#e9f4ef", sevFg: "#1f7a5a", accent: "#5cb795", dot: "#2f9e78", border: "#d7e8df", bg: "#f7fbf9" };
}

// Visual treatment for a parent-link status, reusing the same palette as the
// severity chips so "linked" reads as resolved (green) and "parent not found"
// reads as a gap to close (red).
function linkStyle(status: LinkStatus): { bg: string; fg: string; label: string } {
  switch (status) {
    case "linked": return { bg: "#e9f4ef", fg: "#1f7a5a", label: "Linked to parent" };
    case "needs_confirm": return { bg: "#fbf4e3", fg: "#9a6b00", label: "Confirm parent" };
    case "parent_not_found": return { bg: "#fbecec", fg: "#b23b3b", label: "Parent not found" };
    default: return { bg: "#f1f3f5", fg: "#6a7484", label: "Standalone" };
  }
}

const SAMPLES: { key: string; name: string; meta: string; text: string }[] = [
  { key: "cryologix", name: "CryoLogix MSA", meta: "24 mo · Net 15 · $480k", text: SAMPLE_CONTRACT },
  { key: "helix", name: "Helix Analytics SaaS", meta: "36 mo · uncapped · no DPA", text: SAMPLE_CONTRACT_2 },
  { key: "sentinel", name: "Sentinel change order", meta: "backdated · no precedence", text: SAMPLE_CHANGE_ORDER },
];

const HANDOFF: { field: string; becomes: string }[] = [
  { field: "paymentSchedule", becomes: "The match key and accrual basis in BudgetIQ. AP matches invoices against it; finance accrues from it." },
  { field: "totalValue", becomes: "The budget anchor for the vendor PO and the reforecast variance." },
  { field: "vendor", becomes: "Normalized to link this record to invoices and budget lines downstream." },
];

const card: CSSProperties = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10 };
const fieldLabel: CSSProperties = { fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 3 };

export default function ContractReviewPage() {
  const { forceOffline } = useEngine();

  const [text, setText] = useState(SAMPLE_CONTRACT);
  const [sourceName, setSourceName] = useState("CryoLogix MSA");
  const [selectedSample, setSelectedSample] = useState<string>("cryologix");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [dispositions, setDispositions] = useState<Record<string, Disposition>>({});
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState<string | null>(null);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);

  // Batch review: first-pass every uploaded contract, show a clickable summary.
  const [batchRows, setBatchRows] = useState<BatchRow[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [selectedBatchFile, setSelectedBatchFile] = useState<string | null>(null);
  const cancelBatchRef = useRef(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    setDispositions({});
    setCommitted(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractText: text, useKnowledge, forceOffline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Run the first-pass review across every uploaded contract that has text,
  // with bounded concurrency so a folder of 16 does not fire 16 model calls at
  // once. Rows are seeded in upload order and filled in place as each finishes;
  // the table updates live. Honors the cancel flag between picks.
  async function reviewAll() {
    const items = uploads.filter((u) => u.ok && u.text);
    if (items.length === 0) return;

    cancelBatchRef.current = false;
    setBatchBusy(true);
    setBatchDone(0);
    setSelectedBatchFile(null);
    // Leaving single-document view so the summary table owns the right column.
    setResult(null);
    setError(null);

    const rows: BatchRow[] = items.map((u) => ({ fileName: u.fileName, text: u.text!, result: null, error: null }));
    setBatchRows(rows.map((r) => ({ ...r })));

    let next = 0;
    let completed = 0;
    const worker = async () => {
      while (true) {
        if (cancelBatchRef.current) return;
        const my = next++;
        if (my >= items.length) return;
        const item = items[my];
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contractText: item.text, useKnowledge, forceOffline }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Extraction failed");
          rows[my] = { ...rows[my], result: data, error: null };
        } catch (e: any) {
          rows[my] = { ...rows[my], result: null, error: e.message || "Review failed" };
        }
        completed++;
        setBatchDone(completed);
        setBatchRows(rows.map((r) => ({ ...r })));
      }
    };

    const lanes = Math.min(4, items.length);
    await Promise.all(Array.from({ length: lanes }, () => worker()));
    setBatchBusy(false);
  }

  function stopBatch() {
    cancelBatchRef.current = true;
  }

  // Open one reviewed contract into the existing single-document detail view
  // without re-running the model: the result is already in the row.
  function openBatchRow(row: BatchRow) {
    if (!row.result) return;
    setText(row.text);
    setSourceName(row.fileName);
    setSelectedSample("");
    setResult(row.result);
    setDispositions({});
    setCommitted(null);
    setSelectedBatchFile(row.fileName);
  }

  // Click an uploaded file in the left sidebar to navigate to its review. If a
  // batch has been run, jump straight to that contract's finished result;
  // otherwise load it on its own for a single first-pass run. Either way the
  // sidebar highlights whichever contract is currently on screen.
  function openUpload(u: UploadRow) {
    if (!u.ok || !u.text) return;
    const row = batchRows?.find((r) => r.fileName === u.fileName);
    if (row) {
      // Reviewed in a batch: open the finished result. If it is still in flight,
      // leave the summary table up rather than dropping into an empty view.
      if (row.result) openBatchRow(row);
      return;
    }
    // No batch context for this file: load it for a single review.
    setText(u.text);
    setSourceName(u.fileName);
    setSelectedSample("");
    setResult(null);
    setSelectedBatchFile(null);
    setDispositions({});
    setCommitted(null);
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
      const rows: UploadRow[] = data.files;
      setUploads(rows);
      setBatchRows(null);
      setSelectedBatchFile(null);
      const firstOk = rows.find((r) => r.ok && r.text);
      if (firstOk?.text) {
        setText(firstOk.text);
        setSourceName(firstOk.fileName);
        setSelectedSample("");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadBusy(false);
      setUploadProgress(null);
    }
  }

  async function commit() {
    if (!result) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraction: result, sourceName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Commit failed");
      setCommitted(data.record?.vendor ?? result.vendor ?? "record");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCommitting(false);
    }
  }

  function pickSample(s: { key: string; name: string; text: string }) {
    setText(s.text);
    setSourceName(s.name);
    setSelectedSample(s.key);
    setUploads([]);
    setBatchRows(null);
    setSelectedBatchFile(null);
    setResult(null);
    setDispositions({});
    setCommitted(null);
  }

  function setDisp(key: string, d: Disposition) {
    setDispositions((prev) => ({ ...prev, [key]: prev[key] === d ? (undefined as any) : d }));
  }

  const flags = result?.findings.filter((f) => f.severity === "flag").length ?? 0;
  const reviews = result?.findings.filter((f) => f.severity === "review").length ?? 0;
  const clean = result?.findings.filter((f) => f.severity === "ok").length ?? 0;

  const clauseFindings = result
    ? [...result.findings]
        .filter((f) => !CONSISTENCY_KEYS.has(f.termKey))
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    : [];
  const consistencyFindings = result ? result.findings.filter((f) => CONSISTENCY_KEYS.has(f.termKey)) : [];

  const offline = result?._meta.engine === "offline-heuristic";
  const retrieval = result?._meta.retrieval;
  const reviewDisabled = loading || text.trim().length < 40;
  const batchEligible = uploads.filter((u) => u.ok && u.text).length;

  // Contract-family linking. Once a batch is reviewed we know every document's
  // own Contract No. and the parent each amendment cites, so we can resolve the
  // families across the whole set: an amendment links to exactly the parent it
  // names, evaluated as one unit with only its changed clauses measured. The
  // resolver is pure and deterministic; it just needs the set of extractions.
  const linking = useMemo(() => {
    if (!batchRows) return null;
    const docs = batchRows
      .filter((r) => r.result)
      .map((r) => ({ rowId: r.fileName, sourceName: r.fileName, extraction: r.result! }));
    if (docs.length === 0) return null;
    return resolveContractFamilies(docs);
  }, [batchRows]);

  // Which uploaded file is on screen right now, so the sidebar can highlight it.
  // selectedBatchFile is set from a batch row; otherwise the single-loaded file
  // is tracked by sourceName.
  const activeUploadName = selectedBatchFile ?? sourceName;

  const fields = result
    ? [
        { label: "Vendor", value: result.vendor ?? "–", mono: false },
        { label: "Type", value: result.counterpartyType ?? "–", mono: false },
        { label: "Total value", value: result.totalValue != null ? `$${result.totalValue.toLocaleString()}` : "–", mono: true },
        { label: "Term", value: result.termMonths ? `${result.termMonths} months` : "–", mono: false },
        { label: "Payment", value: result.paymentSchedule ?? "–", mono: false },
        { label: "Auto-renewal", value: result.autoRenewal == null ? "–" : result.autoRenewal ? "Yes" : "No", mono: false },
        { label: "Governing law", value: result.governingLaw ?? "–", mono: false },
        { label: "Dates", value: `${result.startDate ?? "?"} to ${result.endDate ?? "?"}`, mono: true },
      ]
    : [];

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4, gap: 24 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>ContractIQ</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: 0, color: "#16202e" }}>First-pass contract review</h2>
        </div>
        <div style={{ fontSize: 12, color: "#8893a2", maxWidth: 330, textAlign: "right" }}>
          Read once against the Iovance standard-terms playbook. The attorney owns the disposition and the commit.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 22, marginTop: 22, alignItems: "start" }}>
        {/* LEFT: input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 84 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#5a6675", marginBottom: 12 }}>Load a contract</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              style={{ border: `1.5px dashed ${dragging ? "var(--accent)" : "#d4d9e0"}`, borderRadius: 9, padding: "16px 14px", textAlign: "center", background: dragging ? "#f4faf7" : "#fafbfc", marginBottom: 14, cursor: "pointer" }}
            >
              {uploadBusy && uploadProgress ? (
                <UploadProgress state={uploadProgress} />
              ) : (
                <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
                  Drop a file or click to choose. Pick a folder for a batch.<br /><span style={{ fontSize: 10.5, color: "#a3abb6" }}>PDF, DOCX, TXT</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 9 }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose files</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose a folder</button>
              </div>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.text,.md,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              <input ref={folderRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {uploads.length > 0 && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8893a2", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>
                  {uploads.length} uploaded{batchRows ? " · click to open its review" : " · click to load"}
                </div>
                {uploads.map((u, i) => {
                  const clickable = u.ok && !!u.text;
                  const active = clickable && u.fileName === activeUploadName;
                  // When a batch has run, surface each file's worst severity as a dot.
                  const row = batchRows?.find((r) => r.fileName === u.fileName);
                  const sev = row ? batchSeverity(row) : null;
                  const dot = sev ? sevStyle(sev).dot : active ? "var(--accent)" : "#c2cad4";
                  return (
                    <div
                      key={`${u.fileName}-${i}`}
                      onClick={() => openUpload(u)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", border: `1px solid ${active ? "var(--accent)" : "#e6e8ec"}`, borderRadius: 8, background: active ? "#f4faf7" : u.ok ? "#fff" : "#fdf6f6", cursor: clickable ? "pointer" : "default" }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: u.ok ? dot : "#cf5b5b", flexShrink: 0, marginTop: 4 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: u.ok ? (active ? "#16202e" : "#3a4655") : "#b23b3b", lineHeight: 1.35, overflowWrap: "anywhere", wordBreak: "break-word" }}>{u.fileName}</div>
                        <div style={{ fontSize: 10.5, color: "#9aa3b0", marginTop: 1 }}>
                          {u.ok ? (row?.result ? `${row.result.vendor ?? "Reviewed"} · ${batchSeverity(row) ?? "ok"}` : `${u.kind?.toUpperCase()} · ${u.note}`) : u.error}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8893a2", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 9 }}>Or load a bundled sample</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {SAMPLES.map((s) => {
                const active = selectedSample === s.key;
                return (
                  <div
                    key={s.key}
                    onClick={() => pickSample(s)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid ${active ? "var(--accent)" : "#e6e8ec"}`, borderRadius: 8, background: active ? "#f4faf7" : "#fff", cursor: "pointer" }}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "var(--accent)" : "#c2cad4", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: active ? "#16202e" : "#3a4655" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#8893a2" }}>{s.meta}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...card, padding: "15px 18px" }}>
            <div onClick={() => setUseKnowledge((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <div style={{ width: 36, height: 21, borderRadius: 11, background: useKnowledge ? "var(--accent)" : "#d4d9e0", position: "relative", flexShrink: 0, transition: "background .15s" }}>
                <div style={{ width: 17, height: 17, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: useKnowledge ? 17 : 2, transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Ground in Iovance precedent</div>
                <div style={{ fontSize: 11, color: "#8893a2", lineHeight: 1.4 }}>Retrieve top precedents from Knowledge as evidence.</div>
              </div>
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={reviewDisabled}
            style={{ width: "100%", padding: 13, borderRadius: 9, border: "none", background: reviewDisabled ? "#9aa3b0" : "var(--navy)", color: "#fff", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
          >
            {loading && <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "pq-spin .7s linear infinite", display: "inline-block" }} />}
            {loading ? "Reviewing…" : "Run first-pass review"}
          </button>

          {batchEligible >= 2 && (
            batchBusy ? (
              <button
                onClick={stopBatch}
                style={{ width: "100%", padding: 11, borderRadius: 9, border: "1px solid #e3c9c9", background: "#fbf1f1", color: "#b23b3b", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
              >
                <span style={{ width: 13, height: 13, border: "2px solid rgba(178,59,59,.35)", borderTopColor: "#b23b3b", borderRadius: "50%", animation: "pq-spin .7s linear infinite", display: "inline-block" }} />
                Stop ({batchDone}/{batchEligible})
              </button>
            ) : (
              <button
                onClick={reviewAll}
                disabled={loading}
                style={{ width: "100%", padding: 11, borderRadius: 9, border: `1px solid ${loading ? "#d4d9e0" : "var(--navy)"}`, background: "#fff", color: loading ? "#9aa3b0" : "var(--navy)", fontSize: 13, fontWeight: 600 }}
              >
                Review all {batchEligible} uploaded
              </button>
            )
          )}

          {batchBusy && (
            <div style={{ marginTop: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "#5a6675", fontWeight: 600 }}>Reviewing contracts…</span>
                <span className="num" style={{ fontSize: 11, color: "#8893a2" }}>{batchDone}/{batchEligible}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "#eef0f3", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: "var(--accent)", width: `${batchEligible ? (batchDone / batchEligible) * 100 : 0}%`, transition: "width .3s ease" }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "#fdf6f6", border: "1px solid #f0d4d4", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b23b3b", lineHeight: 1.5 }}>{error}</div>
          )}
        </div>

        {/* RIGHT: result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!result && !batchRows && (
            <div style={{ ...card, padding: "46px 30px", textAlign: "center" }}>
              <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "#3a4655", marginBottom: 6 }}>
                {loading ? "Reading the contract…" : `${sourceName} loaded`}
              </div>
              <div style={{ fontSize: 12.5, color: "#8893a2", maxWidth: 380, margin: "0 auto", lineHeight: 1.55 }}>
                Run the first-pass review to see extracted fields, consistency checks, and findings against the playbook.
                {batchEligible >= 2 && " Or review all uploaded contracts at once for a summary table."}
              </div>
            </div>
          )}

          {batchRows && !result && linking && linking.families.length > 0 && (
            <div style={{ ...card, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "#16202e" }}>Contract families</div>
                <div style={{ fontSize: 11, color: "#8893a2" }}>{linking.families.length} linked group{linking.families.length > 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "#8893a2", margin: "6px 0 14px", lineHeight: 1.55 }}>
                A change order is reviewed as one unit with the agreement it modifies. Only the clauses the most recent amendment changes are measured against the playbook; every other clause inherits from the parent. Amendments link by the parent&apos;s Contract No., so a change order ties to its agreement and not to a separate contract from the same vendor.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {linking.families.map((fam) => {
                  const unitFlags = fam.mergedFindings.filter((f) => f.severity === "flag");
                  const unitReviews = fam.mergedFindings.filter((f) => f.severity === "review");
                  return (
                    <div key={fam.key} style={{ border: "1px solid #eef0f3", borderRadius: 9, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 13px", background: "#f7f8fa", borderBottom: "1px solid #eef0f3" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>{fam.vendor ?? "Unknown vendor"}</div>
                          <div className="num" style={{ fontSize: 11, color: "#8893a2", marginTop: 2 }}>
                            {fam.parentMissing
                              ? "Parent agreement not in this upload"
                              : `${fam.parentTitle ?? "Parent agreement"}${fam.parentContractId ? ` · ${fam.parentContractId}` : ""}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {unitFlags.length > 0 && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#fbecec", color: "#b23b3b" }}>{unitFlags.length} flag</span>}
                          {unitReviews.length > 0 && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#fbf4e3", color: "#9a6b00" }}>{unitReviews.length} review</span>}
                          {unitFlags.length === 0 && unitReviews.length === 0 && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#e9f4ef", color: "#1f7a5a" }}>clean unit</span>}
                        </div>
                      </div>

                      {fam.memberRowIds.map((id, mi) => {
                        const row = batchRows.find((r) => r.fileName === id);
                        const ext = row?.result ?? null;
                        const isParent = id === fam.parentRowId;
                        const res = linking.resolutions[id];
                        // Clauses this instrument actually sets/changes (vs inherits).
                        const changed = ext ? ext.findings.filter((f) => f.found !== null || f.severity !== "ok") : [];
                        const ls = res ? linkStyle(res.status) : null;
                        return (
                          <div
                            key={id}
                            onClick={() => row?.result && openBatchRow(row)}
                            style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "9px 13px", borderTop: mi > 0 ? "1px solid #f1f3f5" : "none", cursor: row?.result ? "pointer" : "default" }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645", overflowWrap: "anywhere", lineHeight: 1.35 }}>{id}</div>
                              <div style={{ fontSize: 10.5, color: "#8893a2", marginTop: 2 }}>
                                {isParent
                                  ? `Parent · ${ext?.counterpartyType ?? "agreement"}`
                                  : res && res.status === "linked"
                                  ? `${ext?.counterpartyType ?? "Amendment"} · links to ${res.matchedContractId}`
                                  : `${ext?.counterpartyType ?? "Amendment"} · ${ls?.label ?? "unresolved"}`}
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", flexShrink: 0, maxWidth: 230 }}>
                              {isParent ? (
                                <span style={{ fontSize: 10, color: "#9aa3b0" }}>baseline terms</span>
                              ) : changed.length === 0 ? (
                                <span style={{ fontSize: 10, color: "#9aa3b0" }}>no clause change detected</span>
                              ) : (
                                changed.map((f) => {
                                  const cs = sevStyle(f.severity);
                                  return (
                                    <span key={f.termKey} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9.5, fontWeight: 600, background: cs.sevBg, color: cs.sevFg, whiteSpace: "nowrap" }}>
                                      {f.label}{f.found ? ` → ${f.found}` : ""}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div style={{ padding: "9px 13px", borderTop: "1px solid #f1f3f5", background: "#fcfcfd", fontSize: 11, color: "#5a6675", lineHeight: 1.5 }}>
                        {fam.parentMissing ? (
                          <>Cites a parent that is not in this upload. Add the parent agreement and re-run to evaluate the family as one unit. The change&apos;s own findings still apply{unitFlags.length > 0 ? `: ${unitFlags.map((f) => f.label).join(", ")} flagged.` : "."}</>
                        ) : unitFlags.length > 0 || unitReviews.length > 0 ? (
                          <><strong style={{ color: "#3a4655" }}>Unit review:</strong> {[...unitFlags, ...unitReviews].map((f) => f.label).join(", ")} measured on the most recent change; all other clauses inherit from the parent.</>
                        ) : (
                          <><strong style={{ color: "#3a4655" }}>Unit review:</strong> the most recent changes clear the playbook; inherited clauses unchanged from the parent.</>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {batchRows && !result && (() => {
            const total = batchRows.length;
            const reviewed = batchRows.filter((r) => r.result || r.error).length;
            const flagged = batchRows.filter((r) => batchSeverity(r) === "flag").length;
            const toReview = batchRows.filter((r) => batchSeverity(r) === "review").length;
            const failed = batchRows.filter((r) => r.error).length;
            return (
              <div style={{ ...card, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "#16202e", marginBottom: 3 }}>
                      {batchBusy ? `Reviewing ${batchDone} of ${total}…` : `${total} contracts reviewed`}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#8893a2" }}>
                      First pass against the playbook. Click any row to open its full review.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#fbecec" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#b23b3b" }}>{flagged}</span><span style={{ fontSize: 11.5, color: "#8a4a4a" }}>flagged</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#fbf4e3" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#9a6b00" }}>{toReview}</span><span style={{ fontSize: 11.5, color: "#896515" }}>to review</span></div>
                    {failed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#f1f3f5" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#6a7484" }}>{failed}</span><span style={{ fontSize: 11.5, color: "#6a7484" }}>failed</span></div>}
                  </div>
                </div>

                {batchBusy && (
                  <div style={{ height: 4, borderRadius: 2, background: "#eef0f3", overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ height: "100%", width: `${total ? (reviewed / total) * 100 : 0}%`, background: "var(--accent)", transition: "width .3s" }} />
                  </div>
                )}

                <div style={{ border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 88px 72px 104px", gap: 0, background: "#f7f8fa", borderBottom: "1px solid #eef0f3", padding: "8px 13px" }}>
                    {["Contract", "Vendor", "Total", "Findings"].map((h, i) => (
                      <div key={h} style={{ ...fieldLabel, marginBottom: 0, textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
                    ))}
                  </div>
                  {batchRows.map((row, i) => {
                    const sev = batchSeverity(row);
                    const st = sev ? sevStyle(sev) : null;
                    const rFlags = row.result?.findings.filter((f) => f.severity === "flag").length ?? 0;
                    const rReviews = row.result?.findings.filter((f) => f.severity === "review").length ?? 0;
                    const active = row.fileName === selectedBatchFile;
                    const clickable = !!row.result;
                    return (
                      <div
                        key={`${row.fileName}-${i}`}
                        onClick={() => clickable && openBatchRow(row)}
                        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 88px 72px 104px", gap: 0, alignItems: "center", padding: "10px 13px", borderBottom: i < batchRows.length - 1 ? "1px solid #f1f3f5" : "none", background: active ? "#f4faf7" : "#fff", cursor: clickable ? "pointer" : "default" }}
                      >
                        <div style={{ paddingRight: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#2a3645", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.35 }}>{row.fileName}</div>
                          {(() => {
                            const lr = linking?.resolutions[row.fileName];
                            if (!lr || lr.status === "standalone") return null;
                            const ls = linkStyle(lr.status);
                            return (
                              <div className="num" style={{ fontSize: 10, fontWeight: 600, color: ls.fg, marginTop: 3 }}>
                                {lr.status === "linked" ? `↳ linked to ${lr.matchedContractId}` : ls.label}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: 12, color: "#5a6675", overflowWrap: "anywhere", paddingRight: 8 }}>{row.result?.vendor ?? "–"}</div>
                        <div className="num" style={{ fontSize: 12, color: "#2a3645", textAlign: "right", paddingRight: 8 }}>{row.result?.totalValue != null ? `$${row.result.totalValue.toLocaleString()}` : "–"}</div>
                        <div style={{ textAlign: "right" }}>
                          {row.error ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#b23b3b" }}>failed</span>
                          ) : !row.result ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9aa3b0" }}>
                              <span style={{ width: 11, height: 11, border: "2px solid #d4d9e0", borderTopColor: "#9aa3b0", borderRadius: "50%", animation: "pq-spin .7s linear infinite", display: "inline-block" }} />
                              reviewing
                            </span>
                          ) : (
                            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px", background: st!.sevBg, color: st!.sevFg }}>{sev}</span>
                              {(rFlags > 0 || rReviews > 0) && (
                                <span style={{ fontSize: 10.5, color: "#8893a2", whiteSpace: "nowrap" }}>
                                  {rFlags > 0 && <span style={{ color: "#b23b3b", fontWeight: 600 }}>{rFlags} flag</span>}
                                  {rFlags > 0 && rReviews > 0 && " · "}
                                  {rReviews > 0 && <span style={{ color: "#9a6b00", fontWeight: 600 }}>{rReviews} review</span>}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {result && (
            <>
              {batchRows && (
                <button
                  onClick={() => { setResult(null); setSelectedBatchFile(null); }}
                  style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 7, border: "1px solid #e3e6ea", background: "#fff", color: "#3a4655", fontSize: 12, fontWeight: 600 }}
                >
                  <span style={{ fontSize: 13 }}>&#8592;</span> Back to all {batchRows.length} reviewed
                </button>
              )}

              {/* contract family — when this document modifies a parent, show the
                  link, its confidence, and what it actually changes (the only
                  clauses measured; everything else inherits from the parent). */}
              {result.parentReference?.isAmendment && (() => {
                const ref = result.parentReference!;
                const detailRes = linking?.resolutions[activeUploadName];
                const fam = linking?.families.find((f) => f.memberRowIds.includes(activeUploadName));
                const parentRow = fam?.parentRowId ? batchRows?.find((r) => r.fileName === fam.parentRowId) ?? null : null;
                const ls = detailRes ? linkStyle(detailRes.status) : { bg: "#eef3f8", fg: "#2e6da4", label: "Cited parent" };
                const instr =
                  ref.instrumentType === "amendment" ? "change order"
                  : ref.instrumentType === "sow" ? "statement of work"
                  : ref.instrumentType === "renewal" ? "renewal"
                  : "amendment";
                const changed = result.findings.filter((f) => f.found !== null || f.severity !== "ok");
                return (
                  <div style={{ ...card, padding: 0, overflow: "hidden", borderLeft: `3px solid ${ls.fg}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 18px", borderBottom: "1px solid #f1f3f5" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Contract family</div>
                      <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: ls.bg, color: ls.fg }}>{ls.label}</span>
                    </div>
                    <div style={{ padding: "13px 18px", display: "flex", flexDirection: "column", gap: 11 }}>
                      <div>
                        <div style={fieldLabel}>This {instr} is issued under</div>
                        <div style={{ fontSize: 12.5, color: "#1f2a38", fontWeight: 500 }}>
                          {ref.parentTitle ?? "Parent agreement"}
                          {ref.parentContractId && <span className="num" style={{ color: "#2e6da4" }}> · {ref.parentContractId}</span>}
                          {ref.parentDate && <span style={{ color: "#8893a2" }}> · dated {ref.parentDate}</span>}
                        </div>
                        {ref.counterpartyEntity && <div style={{ fontSize: 11.5, color: "#8893a2", marginTop: 2 }}>Counterparty: {ref.counterpartyEntity}</div>}
                      </div>

                      {ref.rawReference && (
                        <div style={{ fontSize: 11.5, color: "#5a6675", fontStyle: "italic", borderLeft: "2px solid #e3e6ea", paddingLeft: 10, lineHeight: 1.5 }}>
                          &ldquo;{ref.rawReference}&rdquo;
                        </div>
                      )}

                      {detailRes && (
                        <div style={{ fontSize: 11.5, color: "#5a6675", lineHeight: 1.5 }}>{detailRes.rationale}</div>
                      )}
                      {!detailRes && (
                        <div style={{ fontSize: 11.5, color: "#5a6675", lineHeight: 1.5 }}>
                          Upload the parent alongside this document and use &ldquo;Review all&rdquo; to resolve the link and evaluate the family as one unit.
                        </div>
                      )}

                      <div>
                        <div style={fieldLabel}>Changed by this {instr} (the only clauses measured)</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                          {changed.length === 0 ? (
                            <span style={{ fontSize: 11.5, color: "#8893a2" }}>No clause change detected; everything inherits from the parent.</span>
                          ) : (
                            changed.map((f) => {
                              const cs = sevStyle(f.severity);
                              return (
                                <span key={f.termKey} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: cs.sevBg, color: cs.sevFg }}>
                                  {f.label}{f.found ? ` → ${f.found}` : ""}
                                </span>
                              );
                            })
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#9aa3b0", marginTop: 6, lineHeight: 1.5 }}>
                          Every other playbook clause inherits from the parent agreement and is not re-measured here.
                        </div>
                      </div>

                      {parentRow?.result && (
                        <button
                          onClick={() => openBatchRow(parentRow)}
                          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 7, border: "1px solid #e3e6ea", background: "#fff", color: "#3a4655", fontSize: 12, fontWeight: 600 }}
                        >
                          Open parent agreement <span style={{ fontSize: 13 }}>&#8594;</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* extracted fields — lead with what the contract actually is */}
              <div style={{ ...card, padding: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38", marginBottom: 13 }}>Extracted fields</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#eef0f3", border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden" }}>
                  {fields.map((f) => (
                    <div key={f.label} style={{ background: "#fff", padding: "11px 13px" }}>
                      <div style={fieldLabel}>{f.label}</div>
                      <div className={f.mono ? "num" : undefined} style={{ fontSize: 12.5, fontWeight: 500, color: "#1f2a38" }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* engine badge + tally */}
              <div style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 7, background: offline ? "#f1f3f5" : "#e9f4ef", border: `1px solid ${offline ? "#e3e6ea" : "#cfe3d8"}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: offline ? "#9aa3b0" : "#2f9e78" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: offline ? "#5a6675" : "#1f7a5a" }}>{offline ? "Offline heuristic" : "Live"}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "#9aa3b0" }}>
                      {offline ? "no model call" : result._meta.model} · {result._meta.latencyMs} ms
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#fbecec" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#b23b3b" }}>{flags}</span><span style={{ fontSize: 11.5, color: "#8a4a4a" }}>flagged</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#fbf4e3" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#9a6b00" }}>{reviews}</span><span style={{ fontSize: 11.5, color: "#896515" }}>to review</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "#e9f4ef" }}><span className="num" style={{ fontSize: 14, fontWeight: 600, color: "#1f7a5a" }}>{clean}</span><span style={{ fontSize: 11.5, color: "#3f7a64" }}>clean</span></div>
                  </div>
                </div>
                <div style={{ marginTop: 11, fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>{result._meta.note}</div>
              </div>

              {/* grounding panel */}
              {retrieval?.used && retrieval.precedents.length > 0 && (
                <div style={{ background: "#f2f7f4", border: "1px solid #d7e8df", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ color: "var(--accent)", fontSize: 13 }}>&#9678;</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1f6a50" }}>Grounded in Iovance precedent</span>
                    <span className="mono" style={{ fontSize: 11, color: "#6a9a86", marginLeft: "auto" }}>corpus of {retrieval.corpusSize}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {retrieval.precedents.map((p) => {
                      const ps = p.label === "flag" ? { pillBg: "#fbecec", pillFg: "#b23b3b" } : { pillBg: "#e9f4ef", pillFg: "#1f7a5a" };
                      return (
                        <div key={p.id} style={{ background: "#fff", border: "1px solid #e2ece6", borderRadius: 8, padding: "10px 13px", display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: ps.pillBg, color: ps.pillFg }}>{p.label}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: "#2a3645" }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: "#8893a2" }}>{p.note}</div>
                          </div>
                          <span className="num" style={{ fontSize: 12, color: "#6a9a86", fontWeight: 600 }}>{p.score.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* consistency checks */}
              {consistencyFindings.length > 0 && (
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38" }}>Consistency checks</div>
                    <span style={{ fontSize: 11, color: "#9aa3b0" }}>arithmetic, key dates, corporate entity</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(consistencyFindings.length, 3)},1fr)`, gap: 11 }}>
                    {consistencyFindings.map((c) => {
                      const st = sevStyle(c.severity);
                      return (
                        <div key={c.termKey} style={{ border: `1px solid ${st.border}`, borderRadius: 9, padding: "12px 14px", background: st.bg }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#2a3645" }}>{c.label}</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: "#6a7484", lineHeight: 1.5 }}>{c.rationale || c.found}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* findings */}
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38", marginBottom: 12 }}>Findings against the playbook</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {clauseFindings.map((f) => {
                    const st = sevStyle(f.severity);
                    const disp = dispositions[f.termKey];
                    const dispMap = {
                      accepted: { label: "Accepted", bg: "#e9f4ef", fg: "#1f7a5a" },
                      dismissed: { label: "Dismissed", bg: "#f1f3f5", fg: "#6a7484" },
                    } as const;
                    return (
                      <div key={f.termKey} style={{ ...card, borderLeft: `3px solid ${st.accent}`, padding: "15px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 600, letterSpacing: ".3px", textTransform: "uppercase", background: st.sevBg, color: st.sevFg, flexShrink: 0, marginTop: 1 }}>{f.severity}</span>
                          <div style={{ flex: 1 }}>
                            <div className="serif" style={{ fontSize: 14.5, fontWeight: 600, color: "#1f2a38", marginBottom: 9 }}>{f.label}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 10 }}>
                              <div><div style={fieldLabel}>Found in contract</div><div style={{ fontSize: 12.5, color: "#2a3645" }}>{f.found ?? "not present"}</div></div>
                              <div><div style={fieldLabel}>Iovance standard</div><div style={{ fontSize: 12.5, color: "#2a3645" }}>{f.standard}</div></div>
                            </div>
                            {f.rationale && <div style={{ fontSize: 12, color: "#6a7484", lineHeight: 1.5, marginBottom: 11 }}>{f.rationale}</div>}
                            {f.suggestedRedline && (
                              <div style={{ background: "#faf6ec", border: "1px solid #efe7d2", borderRadius: 7, padding: "10px 12px", marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: "#a07a1a", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600, marginBottom: 4 }}>Suggested redline</div>
                                <div className="mono" style={{ fontSize: 11.5, color: "#6e5a1e", lineHeight: 1.5 }}>{f.suggestedRedline}</div>
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              {!disp ? (
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button onClick={() => setDisp(f.termKey, "accepted")} style={{ padding: "7px 15px", borderRadius: 7, border: "1px solid #cfe3d8", background: "#eaf4ee", color: "#1f7a5a", fontSize: 12, fontWeight: 600 }}>Accept</button>
                                  <button onClick={() => setDisp(f.termKey, "dismissed")} style={{ padding: "7px 15px", borderRadius: 7, border: "1px solid #e3e6ea", background: "#fff", color: "#6a7484", fontSize: 12, fontWeight: 600 }}>Dismiss</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, background: dispMap[disp].bg, color: dispMap[disp].fg, fontSize: 12, fontWeight: 600 }}>
                                    {dispMap[disp].label}<span style={{ fontSize: 9.5, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,.06)" }}>human</span>
                                  </span>
                                  <button onClick={() => setDisp(f.termKey, disp)} style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: "transparent", color: "#9aa3b0", fontSize: 11.5, fontWeight: 500, textDecoration: "underline" }}>Undo</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* downstream handoff */}
              <div style={{ background: "#f4f6f9", border: "1px solid #e2e7ee", borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2a38", marginBottom: 3 }}>Downstream handoff to BudgetIQ</div>
                <div style={{ fontSize: 11.5, color: "#8893a2", marginBottom: 14 }}>Three fields from this record are reused downstream. BudgetIQ never re-reads the contract.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {HANDOFF.map((h) => (
                    <div key={h.field} style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 9, padding: 13 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: "#2e6da4", fontWeight: 600, marginBottom: 7 }}>{h.field}</div>
                      <div style={{ fontSize: 11.5, color: "#6a7484", lineHeight: 1.5 }}>{h.becomes}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* commit */}
              <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2a38", marginBottom: 3 }}>Commit to the shared record</div>
                  <div style={{ fontSize: 12, color: "#8893a2" }}>Writes the ContractExtraction record that BudgetIQ reads. Production stays modular against the legal DMS / Oro.</div>
                </div>
                {committed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px", borderRadius: 9, background: "#e9f4ef", border: "1px solid #cfe3d8" }}>
                    <span style={{ color: "#1f7a5a", fontSize: 15 }}>&#10003;</span>
                    <div><div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f7a5a" }}>Committed to shared record</div><div style={{ fontSize: 11, color: "#3f7a64" }}>{committed}</div></div>
                  </div>
                ) : (
                  <button onClick={commit} disabled={committing} style={{ padding: "12px 22px", borderRadius: 9, border: "none", background: committing ? "#9aa3b0" : "var(--navy)", color: "#fff", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {committing ? "Committing…" : "Commit record"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
