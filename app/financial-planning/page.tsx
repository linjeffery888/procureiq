"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUDGET_LINES, SAMPLE_BUDGET_PDF_TEXT } from "@/lib/mockData";
import { BudgetIngestResponse, PersistedBudgetActual, VendorBudgetLine } from "@/lib/types";
import { exportSheets, ExportFormat } from "@/lib/export";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { useEngine } from "../components/engine";
import { UploadProgress } from "../components/UploadProgress";

// BudgetIQ financial planning, ported to the approved comp. Accruals and
// reforecast as one loop: draft the quarter-end accrual from each contract's
// payment schedule, auto-pull actuals, flag only the vendors that genuinely
// need outreach. The accrual BASIS is the payment schedule; when ContractIQ has
// committed a record for the vendor, this page uses that live schedule (the same
// field, read once), otherwise it falls back to the seeded budget line. Dollars
// live on the Impact tab; this is the working surface.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_MONTH = 5; // June (0-indexed). Quarter close in progress, per the call.

interface SharedRecordLite {
  vendor: string | null;
  sourceName: string;
  extraction: { paymentSchedule: string | null; totalValue: number | null };
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function signedUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function normVendor(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ytd(line: VendorBudgetLine): number {
  return line.actualsToDate.reduce((a, b) => a + b, 0);
}
function projectedYear(line: VendorBudgetLine): number {
  const actuals = ytd(line);
  const remaining = line.monthlyExpected.slice(CURRENT_MONTH).reduce((a, b) => a + b, 0);
  return actuals + remaining;
}

// A budget figure read off an uploaded finance export, keyed to a budget line.
interface UploadedActual {
  vendor: string; // parsed vendor name, kept for the persisted record + the list
  amount: number;
  period: string | null;
  note: string;
  sourceName: string;
  engine: BudgetIngestResponse["_meta"]["engine"];
}

interface UploadNote {
  fileName: string;
  ok: boolean;
  detail: string;
}

export default function FinancialPlanningPage() {
  const { forceOffline } = useEngine();

  const [records, setRecords] = useState<SharedRecordLite[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  // Uploaded actuals, keyed by normalized vendor so a parsed export drops onto
  // the matching budget line instead of being re-keyed into the spreadsheet.
  const [actuals, setActuals] = useState<Record<string, UploadedActual>>({});
  const [uploadNotes, setUploadNotes] = useState<UploadNote[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/records")
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setRecords(d.records ?? []))
      .catch(() => setRecords([]));
  }, []);

  // Restore persisted finance actuals on mount, so the accrual drafts and the
  // reforecast variance they feed survive a reload / restart without re-uploading
  // the quarterly export.
  useEffect(() => {
    fetch("/api/budget-actuals")
      .then((r) => (r.ok ? r.json() : { actuals: [] }))
      .then((d) => {
        const restored: Record<string, UploadedActual> = {};
        for (const a of (d.actuals ?? []) as PersistedBudgetActual[]) {
          restored[a.vendorKey] = { vendor: a.vendor, amount: a.amount, period: a.period, note: a.note, sourceName: a.sourceName, engine: a.engine };
        }
        setActuals(restored);
      })
      .catch(() => { /* start empty if the store is unreachable */ });
  }, []);

  const recordByVendor = useMemo(
    () => new Map(records.map((r) => [normVendor(r.vendor), r])),
    [records]
  );

  // Parse one finance export's text into budget figures and map each to the
  // budget line whose vendor it matches. Lines that match no seeded vendor are
  // reported back but not applied, so the planner never invents a row.
  const ingestText = useCallback(
    async (text: string, sourceName: string): Promise<UploadNote> => {
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "budget", text, forceOffline }),
        });
        const json: BudgetIngestResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not parse this document.");
        const known = new Set(BUDGET_LINES.map((l) => normVendor(l.vendor)));
        const matched: Record<string, UploadedActual> = {};
        const unmatched: string[] = [];
        for (const line of json.lines) {
          const key = normVendor(line.vendor);
          if (known.has(key)) {
            matched[key] = { vendor: line.vendor, amount: line.amount, period: line.period, note: line.note, sourceName, engine: json._meta.engine };
          } else {
            unmatched.push(line.vendor);
          }
        }
        setActuals((prev) => ({ ...prev, ...matched }));
        // Persist the matched actuals so the accrual + reforecast survive a restart.
        const toPersist: PersistedBudgetActual[] = Object.entries(matched).map(([vendorKey, a]) => ({
          vendorKey, vendor: a.vendor, amount: a.amount, period: a.period, note: a.note, sourceName: a.sourceName, engine: a.engine, uploadedAt: new Date().toISOString(),
        }));
        if (toPersist.length) {
          fetch("/api/budget-actuals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actuals: toPersist }),
          }).catch(() => { /* keep the optimistic local state even if the persist fails */ });
        }
        const applied = Object.keys(matched).length;
        const parts = [`${applied} figure${applied === 1 ? "" : "s"} applied`];
        if (unmatched.length) parts.push(`${unmatched.length} unmatched (${unmatched.join(", ")})`);
        return { fileName: sourceName, ok: applied > 0, detail: parts.join(", ") };
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
      setUploadError(null);
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
        setUploadError(e.message);
      } finally {
        setUploadBusy(false);
        setUploadProgress(null);
      }
    },
    [ingestText]
  );

  async function loadSampleBudget() {
    setUploadBusy(true);
    setUploadError(null);
    const note = await ingestText(SAMPLE_BUDGET_PDF_TEXT, "Sample actuals (Finance export).pdf");
    setUploadNotes([note]);
    setUploadBusy(false);
  }

  // Remove one applied actual: the accrual placeholder and the reforecast revert
  // to the projected figure. Removed server-side too so it does not come back.
  async function removeActual(vendorKey: string) {
    setActuals((prev) => { const n = { ...prev }; delete n[vendorKey]; return n; });
    try {
      await fetch(`/api/budget-actuals?vendorKey=${encodeURIComponent(vendorKey)}`, { method: "DELETE" });
    } catch { /* the row is already gone locally; the store reconciles on reload */ }
  }

  async function clearUploads() {
    setActuals({});
    setUploadNotes([]);
    try {
      await fetch("/api/budget-actuals", { method: "DELETE" });
    } catch { /* local state cleared regardless */ }
  }

  const actualByVendor = actuals;
  const uploadedCount = Object.keys(actualByVendor).length;
  const anyLive = Object.values(actualByVendor).some((a) => a.engine === "live");

  const accruals = useMemo(
    () =>
      BUDGET_LINES.map((line) => {
        const rec = recordByVendor.get(normVendor(line.vendor));
        const schedule = rec?.extraction.paymentSchedule ?? line.paymentSchedule;
        const predictable = /monthly|quarterly/i.test(schedule) && !/variable|usage/i.test(schedule);
        const up = actualByVendor[normVendor(line.vendor)];
        if (up) {
          // The actual figure arrived on an upload, so there is nothing to
          // estimate or chase: the placeholder is replaced with the real number.
          return {
            vendor: line.vendor,
            predicted: up.amount,
            schedule,
            backed: Boolean(rec),
            fromUpload: true,
            basis: `Actual ${up.note}${up.period ? ` (${up.period})` : ""} read from ${up.sourceName}. Placeholder replaced; no outreach needed.`,
            needsOutreach: false,
          };
        }
        return {
          vendor: line.vendor,
          predicted: line.monthlyExpected[CURRENT_MONTH],
          schedule,
          backed: Boolean(rec),
          fromUpload: false,
          basis: predictable
            ? `Schedule "${schedule}" ${rec ? "from the committed ContractIQ record" : "from the budget line"}. No outreach needed.`
            : `Usage-based schedule. Last actuals trend used; flag for vendor confirmation.`,
          needsOutreach: !predictable,
        };
      }),
    [recordByVendor, actualByVendor]
  );

  const reforecast = useMemo(
    () =>
      BUDGET_LINES.map((line) => {
        const up = actualByVendor[normVendor(line.vendor)];
        // An uploaded actual lands in the current month if that month has not
        // been keyed yet, folding the figure into actuals YTD and the projection.
        const folded = up && line.actualsToDate[CURRENT_MONTH] === 0;
        const actualsYtd = ytd(line) + (folded ? up.amount : 0);
        const remaining = line.monthlyExpected.slice(CURRENT_MONTH + 1).reduce((a, b) => a + b, 0);
        const projected = folded ? actualsYtd + remaining : projectedYear(line);
        const variance = projected - line.annualBudget;
        return {
          vendor: line.vendor,
          budget: line.annualBudget,
          actuals: actualsYtd,
          projected,
          variance,
          fromUpload: Boolean(folded),
        };
      }),
    [actualByVendor]
  );

  const backedCount = accruals.filter((a) => a.backed).length;
  const plannerBackedNote =
    backedCount > 0
      ? `${backedCount} of these draft${backedCount === 1 ? "" : "s"} ${backedCount === 1 ? "is" : "are"} backed by a committed ContractIQ record.`
      : "No committed records yet, so this runs off the seeded budget lines.";

  function doExport(fmt: ExportFormat) {
    const accrualsSheet = {
      name: "Draft accruals",
      rows: [
        ["Vendor", "Predicted invoice", "Basis", "Record-backed", "Action"],
        ...accruals.map((a) => [
          a.vendor,
          usd(a.predicted),
          a.basis,
          a.backed ? "yes" : "no",
          a.fromUpload ? "accrued from upload" : a.needsOutreach ? "confirm w/ vendor" : "auto-accrue",
        ]),
      ] as (string | number)[][],
    };
    const reforecastSheet = {
      name: "Reforecast vs budget",
      rows: [
        ["Vendor", "Annual budget", "Actuals YTD", "Projected EOY", "Variance"],
        ...reforecast.map((r) => [
          r.vendor,
          usd(r.budget),
          usd(r.actuals),
          usd(r.projected),
          signedUsd(r.variance),
        ]),
      ] as (string | number)[][],
    };
    exportSheets([accrualsSheet, reforecastSheet], fmt, "procureiq-planning");
    setExportOpen(false);
  }

  const headerCell: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: "#9aa3b0",
    textTransform: "uppercase",
    letterSpacing: ".5px",
  };

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>
            BudgetIQ, Financial planning
          </div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 11px", color: "#16202e" }}>
            Quarter-close accrual and reforecast
          </h2>
          <p style={{ fontSize: 13.5, color: "#5a6675", lineHeight: 1.55, margin: 0, maxWidth: 780 }}>
            Each accrual basis is the <span className="mono" style={{ color: "#2e6da4" }}>paymentSchedule</span> field, reused here instead of
            emailing the vendor. Predictable schedules auto-accrue; only usage-based vendors need outreach.{" "}
            <span style={{ color: "#2a3645", fontWeight: 500 }}>{plannerBackedNote}</span>
          </p>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setExportOpen((v) => !v)}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
          >
            Export<span style={{ color: "#9aa3b0", fontSize: 8 }}>&#9660;</span>
          </button>
          {exportOpen && (
            <>
              <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #e6e8ec", borderRadius: 9, boxShadow: "0 10px 28px rgba(20,30,45,.13)", zIndex: 40, minWidth: 182, overflow: "hidden" }}>
                <div className="pq-menu-item" onClick={() => doExport("csv")} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f1f3f5" }}>
                  <span className="mono" style={{ fontSize: 10, color: "#5a7290", fontWeight: 600, width: 30 }}>CSV</span>
                  <span style={{ fontSize: 12.5, color: "#2a3645" }}>Comma-separated</span>
                </div>
                <div className="pq-menu-item" onClick={() => doExport("xlsx")} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mono" style={{ fontSize: 10, color: "#1f7a5a", fontWeight: 600, width: 30 }}>XLSX</span>
                  <span style={{ fontSize: 12.5, color: "#2a3645" }}>Excel, two sheets</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* upload finance actuals (the quarterly re-keying Ben described, automated) */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", marginBottom: 4 }}>Upload finance actuals</div>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.5 }}>
              Instead of re-keying the quarterly actuals export into the budget spreadsheet, drop it here. Each figure lands on its vendor's line, replacing the accrual placeholder.
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
                Drop an actuals export or click to choose.<br /><span style={{ fontSize: 10.5, color: "#a3abb6" }}>PDF, DOCX, TXT</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 9 }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Choose file</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); loadSampleBudget(); }} style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600 }}>Try a sample</button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.text,.md,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
        {uploadError && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: "#b23b3b" }}>{uploadError}</div>
        )}
        {uploadNotes.length > 0 && (
          <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            {uploadNotes.map((n, i) => (
              <div key={`${n.fileName}-${i}`} style={{ fontSize: 11.5, color: n.ok ? "#5a6675" : "#b23b3b", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{n.fileName}</span>{" "}
                {n.ok ? <span style={{ color: "#1f7a5a" }}>parsed: {n.detail}</span> : <span>{n.detail}</span>}
              </div>
            ))}
          </div>
        )}
        {uploadedCount > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f3f5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 600 }}>{uploadedCount} actual{uploadedCount === 1 ? "" : "s"} applied to budget lines</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#e9f4ef", color: "#1f7a5a" }}>saved, survives restart</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: anyLive ? "#ece9f9" : "#f1f3f5", color: anyLive ? "#5b54a3" : "#5a6675" }}>
                {anyLive ? "parsed by model" : "parsed offline"}
              </span>
              <button onClick={clearUploads} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e7ee", background: "#fff", color: "#7a8493", fontSize: 11, fontWeight: 600 }}>Clear all</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(actualByVendor).map(([vendorKey, a]) => (
                <div key={vendorKey} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 7 }}>
                  <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.vendor}</span>
                  <span className="num" style={{ fontSize: 11.5, color: "#5a6675", whiteSpace: "nowrap" }}>{usd(a.amount)}</span>
                  <span style={{ fontSize: 10.5, color: "#9aa3b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{`${a.note}${a.period ? ` (${a.period})` : ""} from ${a.sourceName}`}</span>
                  <button onClick={() => removeActual(vendorKey)} title="Remove this actual" style={{ marginLeft: "auto", flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: "1px solid #e2e7ee", background: "#fff", color: "#b23b3b", fontSize: 13, fontWeight: 600, lineHeight: 1, cursor: "pointer" }}>&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Draft accruals */}
      <h3 className="serif" style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#16202e" }}>
        Draft accruals, {MONTHS[CURRENT_MONTH]} quarter close
      </h3>
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 2fr 0.95fr", columnGap: 36, padding: "11px 20px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", ...headerCell }}>
          <div>Vendor</div>
          <div style={{ textAlign: "right" }}>Predicted invoice</div>
          <div>Basis</div>
          <div style={{ textAlign: "right" }}>Action</div>
        </div>
        {accruals.map((a) => (
          <div key={a.vendor} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 2fr 0.95fr", columnGap: 36, padding: "var(--row-pad,14px 20px)", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#2a3645", fontWeight: 500 }}>{a.vendor}</span>
              {a.fromUpload && (
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#eef1fb", color: "#3a5fb0" }}>uploaded</span>
              )}
              {a.backed && (
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a" }}>record</span>
              )}
            </div>
            <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 500 }}>{usd(a.predicted)}</div>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.4, paddingLeft: 18, borderLeft: "1px solid #eef0f3" }}>{a.basis}</div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 6, whiteSpace: "nowrap", background: a.fromUpload ? "#eef1fb" : a.needsOutreach ? "#fbf4e3" : "#e9f4ef", color: a.fromUpload ? "#3a5fb0" : a.needsOutreach ? "#9a6b00" : "#1f7a5a" }}>
                {a.fromUpload ? "accrued from upload" : a.needsOutreach ? "confirm w/ vendor" : "auto-accrue"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reforecast vs budget */}
      <h3 className="serif" style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#16202e" }}>
        Reforecast vs budget
      </h3>
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", columnGap: 28, padding: "11px 20px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", ...headerCell }}>
          <div>Vendor</div>
          <div style={{ textAlign: "right" }}>Annual budget</div>
          <div style={{ textAlign: "right" }}>Actuals YTD</div>
          <div style={{ textAlign: "right" }}>Projected EOY</div>
          <div style={{ textAlign: "right" }}>Variance</div>
        </div>
        {reforecast.map((r) => (
          <div key={r.vendor} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", columnGap: 28, padding: "var(--row-pad,14px 20px)", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
            <div style={{ color: "#2a3645", fontWeight: 500 }}>{r.vendor}</div>
            <div className="num" style={{ textAlign: "right", color: "#5a6675" }}>{usd(r.budget)}</div>
            <div className="num" style={{ textAlign: "right", color: "#5a6675" }}>{usd(r.actuals)}</div>
            <div className="num" style={{ textAlign: "right", color: "#2a3645" }}>{usd(r.projected)}</div>
            <div className="num" style={{ textAlign: "right", fontWeight: 600, color: r.variance > 0 ? "#b23b3b" : "#1f7a5a" }}>
              {signedUsd(r.variance)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: "#9aa3b0", lineHeight: 1.6, maxWidth: 920 }}>
        Synthetic budget lines, not real Iovance data. Finance confirms every accrual and signs the reforecast; the draft
        clears the routine re-keying so the leads spend the quarter close on judgment, not data entry.
      </div>
    </div>
  );
}
