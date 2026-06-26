"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_BUDGET_PDF_TEXT } from "@/lib/mockData";
import {
  BudgetIngestResponse,
  BudgetPlanIngestResponse,
  BudgetSource,
  IngestEngine,
  PersistedBudgetActual,
  StoredUpload,
  VendorBudgetLine,
} from "@/lib/types";
import { exportSheets, ExportFormat } from "@/lib/export";
import { logAudit } from "@/lib/auditClient";
import { postFilesWithProgress, UploadProgressState } from "@/lib/uploadClient";
import { spreadAnnual } from "@/lib/budgetParse";
import { useEngine } from "../components/engine";
import { useReviewer } from "../components/reviewer";
import { UploadProgress } from "../components/UploadProgress";

// BudgetIQ financial planning. Accruals and reforecast as one loop, now run off a
// LIVE budget the planner owns: the budget table is seeded with synthetic lines so
// the demo is never empty, but it can be replaced/appended from an uploaded CSV,
// XLSX, or PDF and edited inline (persisted to data/budget.json). Actuals arrive as
// loose invoices: uploaded exports (CSV/XLSX/PDF, a batch or one file) OR rolled up
// from approved invoices in the matching queue, matched to the live budget by
// vendor. Each accrual is explicit about whether it is a real actual or an estimate
// to be trued up. Dollars live on the Impact tab; this is the working surface.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_MONTH = 5; // June (0-indexed). Quarter close in progress, per the call.

// Files we can read on either upload surface. PDF/DOCX/text for prose, CSV/XLSX for
// a real budget or actuals spreadsheet (read by extractText -> the deterministic
// table parser, with a model fallback only for prose).
const ACCEPT = ".pdf,.docx,.txt,.text,.md,.csv,.xlsx,.xls,.xlsm,application/pdf";

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

// Canonical vendor key, identical to lib/budgetParse vendorKey and the matching
// normalizer: lowercase, strip punctuation and corporate suffixes, collapse space.
function normVendor(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(s: string): number {
  const n = Number((s || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ytd(line: VendorBudgetLine): number {
  return line.actualsToDate.reduce((a, b) => a + b, 0);
}
function projectedYear(line: VendorBudgetLine): number {
  const actuals = ytd(line);
  const remaining = line.monthlyExpected.slice(CURRENT_MONTH).reduce((a, b) => a + b, 0);
  return actuals + remaining;
}

// The four explicit states an accrual line can be in at quarter close. The
// distinction the planner cares about: is this a real ACTUAL in hand, or an
// ESTIMATE, and if an estimate, how confident.
type AccrualKind = "actual" | "scheduled" | "estimate" | "outreach";

// Classify a payment schedule into the estimate confidence for a vendor with no
// actual yet. usage-based -> must confirm; fixed cadence + amount -> scheduled
// (high confidence); predictable cadence without a fixed amount -> estimate.
function classifyEstimate(schedule: string): "scheduled" | "estimate" | "outreach" {
  const s = (schedule || "").toLowerCase();
  if (/usage|metered|consumption/.test(s)) return "outreach";
  if (/variable|estimate|per[-\s]?batch|milestone|as[-\s]?needed|tbd/.test(s)) return "estimate";
  const hasAmount = /\$\s?[\d,]+/.test(s);
  const hasCadence = /month|quarter|annual|year|week/.test(s);
  if (hasCadence && hasAmount) return "scheduled";
  return "estimate";
}

function actionBadge(kind: AccrualKind): { label: string; bg: string; fg: string } {
  switch (kind) {
    case "actual":
      return { label: "actual", bg: "#e9f4ef", fg: "#1f7a5a" };
    case "scheduled":
      return { label: "auto-accrue", bg: "#eef1fb", fg: "#3a5fb0" };
    case "estimate":
      return { label: "estimate, true-up", bg: "#fff4e3", fg: "#9a6b00" };
    case "outreach":
      return { label: "confirm w/ vendor", bg: "#fbedec", fg: "#a8473f" };
  }
}

// A budget figure read off an uploaded finance export or an approved invoice,
// keyed to a budget line so it is never re-keyed into the spreadsheet.
interface UploadedActual {
  vendor: string;
  amount: number;
  period: string | null;
  note: string;
  sourceName: string;
  engine: IngestEngine;
  fromInvoices?: boolean; // rolled up from the approved-invoice queue
}

// An actual figure whose vendor matched no budget line. Surfaced so the planner
// can add a budget line for it instead of silently dropping the figure.
interface UnmatchedActual {
  vendor: string;
  amount: number;
  period: string | null;
  note: string;
  sourceName: string;
  engine: IngestEngine;
}

interface UploadNote {
  fileName: string;
  ok: boolean;
  detail: string;
}

function mergeUnmatched(prev: UnmatchedActual[], add: UnmatchedActual[]): UnmatchedActual[] {
  const byKey = new Map(prev.map((u) => [normVendor(u.vendor), u]));
  for (const u of add) byKey.set(normVendor(u.vendor), u);
  return [...byKey.values()];
}

export default function FinancialPlanningPage() {
  const { forceOffline, demoMode } = useEngine();
  const { name: reviewer } = useReviewer();
  const demoRanRef = useRef(false);

  const [records, setRecords] = useState<SharedRecordLite[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  // Live budget (from /api/budget). The accrual + reforecast run off this, not a
  // hard-coded constant, so an uploaded/edited budget drives the whole surface.
  const [budget, setBudget] = useState<VendorBudgetLine[]>([]);
  const [budgetSource, setBudgetSource] = useState<BudgetSource>("seed");
  const [budgetUpdatedAt, setBudgetUpdatedAt] = useState<string | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);

  // Budget-source card: upload + inline edit + add/remove.
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);
  const [budgetErr, setBudgetErr] = useState<string | null>(null);
  const [budgetMode, setBudgetMode] = useState<"replace" | "append">("replace");
  const [budgetDragging, setBudgetDragging] = useState(false);
  const budgetFileRef = useRef<HTMLInputElement>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editAnnual, setEditAnnual] = useState("");
  const [editSchedule, setEditSchedule] = useState("");
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [newAnnual, setNewAnnual] = useState("");
  const [newSchedule, setNewSchedule] = useState("");

  // Actuals, keyed by normalized vendor so a parsed figure drops onto its line.
  const [actuals, setActuals] = useState<Record<string, UploadedActual>>({});
  const [unmatched, setUnmatched] = useState<UnmatchedActual[]>([]);
  const [uploadNotes, setUploadNotes] = useState<UploadNote[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Invoice roll-up (approved invoices -> budget actuals).
  const [rollupBusy, setRollupBusy] = useState(false);
  const [rollupMsg, setRollupMsg] = useState<string | null>(null);

  // ---- Loaders ----
  const loadBudget = useCallback(async () => {
    try {
      const r = await fetch("/api/budget");
      const d = await r.json();
      setBudget(Array.isArray(d.lines) ? d.lines : []);
      setBudgetSource(d.source === "ingested" ? "ingested" : "seed");
      setBudgetUpdatedAt(typeof d.updatedAt === "string" ? d.updatedAt : null);
    } catch {
      /* keep whatever we have */
    } finally {
      setBudgetLoading(false);
    }
  }, []);
  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  useEffect(() => {
    fetch("/api/records")
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setRecords(d.records ?? []))
      .catch(() => setRecords([]));
  }, []);

  // Restore persisted finance actuals on mount, so the accrual + reforecast survive
  // a reload / restart without re-uploading the quarterly export.
  useEffect(() => {
    fetch("/api/budget-actuals")
      .then((r) => (r.ok ? r.json() : { actuals: [] }))
      .then((d) => {
        const restored: Record<string, UploadedActual> = {};
        for (const a of (d.actuals ?? []) as PersistedBudgetActual[]) {
          restored[a.vendorKey] = {
            vendor: a.vendor,
            amount: a.amount,
            period: a.period,
            note: a.note,
            sourceName: a.sourceName,
            engine: a.engine,
            fromInvoices: /invoice/i.test(a.sourceName) || /invoice/i.test(a.note),
          };
        }
        setActuals(restored);
      })
      .catch(() => {
        /* start empty if the store is unreachable */
      });
  }, []);

  const recordByVendor = useMemo(() => new Map(records.map((r) => [normVendor(r.vendor), r])), [records]);

  // ---- Apply parsed actuals to the live budget ----
  // Shared by uploads, the invoice roll-up, and the sample. Matches each figure to
  // a live budget line by normalized vendor; unmatched figures are surfaced (not
  // applied) so the planner can add a budget line for them. Persists + audits.
  const applyActuals = useCallback(
    (
      lines: { vendor: string; amount: number; period: string | null; note: string }[],
      sourceName: string,
      engine: IngestEngine,
      fromInvoices: boolean,
    ): { applied: number; unmatched: UnmatchedActual[] } => {
      const known = new Map(budget.map((l) => [normVendor(l.vendor), l.vendor]));
      const matched: Record<string, UploadedActual> = {};
      const miss: UnmatchedActual[] = [];
      for (const line of lines) {
        if (!line.vendor || !(line.amount > 0)) continue;
        const key = normVendor(line.vendor);
        if (!key) continue;
        if (known.has(key)) {
          matched[key] = { vendor: known.get(key)!, amount: line.amount, period: line.period, note: line.note, sourceName, engine, fromInvoices };
        } else {
          miss.push({ vendor: line.vendor, amount: line.amount, period: line.period, note: line.note, sourceName, engine });
        }
      }
      const appliedKeys = Object.keys(matched);
      if (appliedKeys.length) {
        setActuals((prev) => ({ ...prev, ...matched }));
        const toPersist: PersistedBudgetActual[] = Object.entries(matched).map(([vendorKey, a]) => ({
          vendorKey,
          vendor: a.vendor,
          amount: a.amount,
          period: a.period,
          note: a.note,
          sourceName: a.sourceName,
          engine: a.engine,
          uploadedAt: new Date().toISOString(),
        }));
        fetch("/api/budget-actuals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actuals: toPersist }) }).catch(() => {});
        const vendors = Object.values(matched).map((a) => a.vendor);
        logAudit({
          module: "BudgetIQ",
          action: "budget-actuals",
          surface: "Budget planning",
          actor: reviewer,
          actionLabel: fromInvoices ? "Rolled up invoices" : "Applied actuals",
          subject: sourceName,
          outcome: "applied",
          detail: [
            `${vendors.length} actual${vendors.length === 1 ? "" : "s"} ${fromInvoices ? "rolled up from approved invoices" : "applied to the reforecast"} (${vendors.join(", ")}).`,
            miss.length ? `${miss.length} line(s) unmatched and left out: ${miss.map((m) => m.vendor).join(", ")}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
      if (miss.length) setUnmatched((prev) => mergeUnmatched(prev, miss));
      return { applied: appliedKeys.length, unmatched: miss };
    },
    [budget],
  );

  // Parse one finance export's text (kind=budget) into figures, then apply them.
  const ingestActuals = useCallback(
    async (text: string, sourceName: string): Promise<UploadNote> => {
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "budget", text, sourceName, forceOffline }),
        });
        const json: BudgetIngestResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not parse this document.");
        const { applied, unmatched: miss } = applyActuals(
          json.lines.map((l) => ({ vendor: l.vendor, amount: l.amount, period: l.period, note: l.note })),
          sourceName,
          json._meta.engine,
          false,
        );
        const parts = [`${applied} figure${applied === 1 ? "" : "s"} applied`];
        if (miss.length) parts.push(`${miss.length} unmatched (${miss.map((m) => m.vendor).join(", ")})`);
        return { fileName: sourceName, ok: applied > 0 || miss.length > 0, detail: parts.join(", ") };
      } catch (e: any) {
        return { fileName: sourceName, ok: false, detail: e.message };
      }
    },
    [forceOffline, applyActuals],
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
            notes.push(await ingestActuals(f.text, f.fileName));
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
    [ingestActuals],
  );

  async function loadSampleActuals() {
    setUploadBusy(true);
    setUploadError(null);
    const note = await ingestActuals(SAMPLE_BUDGET_PDF_TEXT, "Sample actuals (Finance export).pdf");
    setUploadNotes([note]);
    setUploadBusy(false);
  }

  // Roll up approved invoices from the matching queue into budget actuals: sum the
  // approved/overridden invoice amounts per vendor and apply them to the live
  // budget, the same way an uploaded actuals figure lands.
  async function rollupInvoices() {
    setRollupBusy(true);
    setRollupMsg(null);
    try {
      const r = await fetch("/api/uploads");
      const d = await r.json();
      const ups = (d.uploads ?? []) as StoredUpload[];
      const approved = ups.filter((u) => u.decision === "approved" || u.decision === "override");
      if (approved.length === 0) {
        setRollupMsg("No approved invoices yet. Approve invoices in BudgetIQ matching, then roll them up here.");
        return;
      }
      const byVendor = new Map<string, { vendor: string; amount: number; count: number }>();
      for (const u of approved) {
        const key = normVendor(u.invoice.vendor);
        const cur = byVendor.get(key);
        if (cur) {
          cur.amount += u.invoice.amount;
          cur.count++;
        } else {
          byVendor.set(key, { vendor: u.invoice.vendor, amount: u.invoice.amount, count: 1 });
        }
      }
      const engine: IngestEngine = approved.some((u) => u.engine === "live") ? "live" : "offline-heuristic";
      const lines = [...byVendor.values()].map((v) => ({
        vendor: v.vendor,
        amount: v.amount,
        period: "approved invoices",
        note: `${v.count} approved invoice${v.count === 1 ? "" : "s"}`,
      }));
      const { applied, unmatched: miss } = applyActuals(lines, "Invoice matching (approved)", engine, true);
      setRollupMsg(
        `${applied} vendor actual${applied === 1 ? "" : "s"} rolled up from ${approved.length} approved invoice${approved.length === 1 ? "" : "s"}.${miss.length ? ` ${miss.length} vendor(s) had no budget line.` : ""}`,
      );
    } catch (e: any) {
      setRollupMsg(`Could not roll up invoices: ${e.message}`);
    } finally {
      setRollupBusy(false);
    }
  }

  // Remove one applied actual: the accrual placeholder and the reforecast revert.
  async function removeActual(vendorKey: string) {
    setActuals((prev) => {
      const n = { ...prev };
      delete n[vendorKey];
      return n;
    });
    try {
      await fetch(`/api/budget-actuals?vendorKey=${encodeURIComponent(vendorKey)}`, { method: "DELETE" });
    } catch {
      /* the row is already gone locally; the store reconciles on reload */
    }
  }

  async function clearUploads() {
    setActuals({});
    setUnmatched([]);
    setUploadNotes([]);
    setRollupMsg(null);
    try {
      await fetch("/api/budget-actuals", { method: "DELETE" });
    } catch {
      /* local state cleared regardless */
    }
  }

  // ---- Budget-source mutations ----
  function applyLiveBudget(d: { lines?: unknown; source?: unknown; updatedAt?: unknown }) {
    setBudget(Array.isArray(d.lines) ? (d.lines as VendorBudgetLine[]) : []);
    setBudgetSource(d.source === "ingested" ? "ingested" : "seed");
    setBudgetUpdatedAt(typeof d.updatedAt === "string" ? d.updatedAt : null);
  }

  function auditBudget(actionLabel: string, subject: string, detail: string) {
    logAudit({
      module: "BudgetIQ",
      action: "budget-updated",
      surface: "Budget planning / Budget source",
      actor: reviewer,
      actionLabel,
      subject,
      outcome: "applied",
      detail,
    });
  }

  // Upload a budget (the plan itself). Parsed by kind=budget-plan (deterministic
  // for CSV/XLSX, model fallback for prose), then persisted with the chosen mode.
  async function handleBudgetFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBudgetBusy(true);
    setBudgetErr(null);
    setBudgetMsg(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const data = await up.json();
      if (!up.ok) throw new Error(data.error || "Upload failed");
      const fileList = (data.files ?? []) as { fileName: string; ok: boolean; text?: string; error?: string }[];
      let allLines: VendorBudgetLine[] = [];
      const warnings: string[] = [];
      let engine: IngestEngine = "offline-heuristic";
      for (const f of fileList) {
        if (!f.ok || !f.text) {
          warnings.push(`${f.fileName}: ${f.error || "unreadable"}`);
          continue;
        }
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "budget-plan", text: f.text, sourceName: f.fileName, forceOffline }),
        });
        const json: BudgetPlanIngestResponse & { error?: string } = await res.json();
        if (!res.ok) {
          warnings.push(`${f.fileName}: ${json.error || "parse failed"}`);
          continue;
        }
        allLines = allLines.concat(json.lines);
        if (json.warnings?.length) warnings.push(...json.warnings);
        engine = json._meta.engine;
      }
      if (allLines.length === 0) {
        setBudgetErr(`No budget lines could be read. ${warnings.join(" ")}`.trim());
        return;
      }
      const r = await fetch("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: allLines, mode: budgetMode }),
      });
      const live = await r.json();
      if (!r.ok) throw new Error(live.error || "Could not save the budget.");
      applyLiveBudget(live);
      const names = fileList.map((f) => f.fileName).join(", ");
      auditBudget(
        budgetMode === "replace" ? "Replaced budget" : "Appended to budget",
        names,
        `${budgetMode === "replace" ? "Replaced" : "Appended"} ${allLines.length} vendor budget line(s) from ${names} (${engine === "live" ? "model" : "deterministic"} parse). Live budget now has ${live.lines.length} line(s).`,
      );
      setBudgetMsg(`${budgetMode === "replace" ? "Replaced" : "Appended"} ${allLines.length} budget line(s) from ${names}.${warnings.length ? ` ${warnings.length} note(s): ${warnings.join("; ")}` : ""}`);
    } catch (e: any) {
      setBudgetErr(e.message);
    } finally {
      setBudgetBusy(false);
    }
  }

  function beginEdit(line: VendorBudgetLine) {
    setAdding(false);
    setEditKey(normVendor(line.vendor));
    setEditAnnual(String(line.annualBudget));
    setEditSchedule(line.paymentSchedule);
  }

  async function saveEdit(line: VendorBudgetLine) {
    const annual = parseAmount(editAnnual);
    if (annual <= 0) {
      setBudgetErr("Annual budget must be a positive number.");
      return;
    }
    // Re-spread evenly only when the annual actually changed; otherwise keep the
    // existing monthly shape (e.g. quarterly lumps) and just update the schedule.
    const monthly = annual === line.annualBudget ? line.monthlyExpected : spreadAnnual(annual);
    const updated: VendorBudgetLine = { ...line, annualBudget: annual, monthlyExpected: monthly, paymentSchedule: editSchedule.trim() || line.paymentSchedule };
    setEditKey(null);
    setBudgetErr(null);
    try {
      const r = await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line: updated }) });
      const live = await r.json();
      if (!r.ok) throw new Error(live.error || "Could not save the edit.");
      applyLiveBudget(live);
      auditBudget("Edited budget line", line.vendor, `${line.vendor}: annual budget set to ${usd(annual)}, schedule "${updated.paymentSchedule}".`);
      setBudgetMsg(`Updated ${line.vendor}.`);
    } catch (e: any) {
      setBudgetErr(e.message);
    }
  }

  async function removeLine(vendor: string) {
    try {
      const r = await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeVendor: vendor }) });
      const live = await r.json();
      if (!r.ok) throw new Error(live.error || "Could not remove the line.");
      applyLiveBudget(live);
      auditBudget("Removed budget line", vendor, `Removed ${vendor} from the live budget.`);
      setBudgetMsg(`Removed ${vendor}.`);
    } catch (e: any) {
      setBudgetErr(e.message);
    }
  }

  async function addLine() {
    const v = newVendor.trim();
    const annual = parseAmount(newAnnual);
    if (!v || annual <= 0) {
      setBudgetErr("A new line needs a vendor name and a positive annual budget.");
      return;
    }
    const line: VendorBudgetLine = {
      vendor: v,
      annualBudget: annual,
      monthlyExpected: spreadAnnual(annual),
      actualsToDate: new Array(12).fill(0),
      paymentSchedule: newSchedule.trim() || `Monthly, $${Math.round(annual / 12).toLocaleString()}`,
    };
    try {
      const r = await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line }) });
      const live = await r.json();
      if (!r.ok) throw new Error(live.error || "Could not add the line.");
      applyLiveBudget(live);
      auditBudget("Added budget line", v, `Added ${v} to the live budget (${usd(annual)}/yr, "${line.paymentSchedule}").`);
      setAdding(false);
      setNewVendor("");
      setNewAnnual("");
      setNewSchedule("");
      setBudgetErr(null);
      setBudgetMsg(`Added ${v}.`);
    } catch (e: any) {
      setBudgetErr(e.message);
    }
  }

  // Add a budget line for an unmatched actual (annualized from the figure), then
  // apply the actual to it. Turns "this vendor has no budget" into one click.
  async function addUnmatchedToBudget(u: UnmatchedActual) {
    const annual = Math.max(1, Math.round(u.amount * 12));
    const line: VendorBudgetLine = {
      vendor: u.vendor,
      annualBudget: annual,
      monthlyExpected: spreadAnnual(annual),
      actualsToDate: new Array(12).fill(0),
      paymentSchedule: `Monthly, ~$${Math.round(annual / 12).toLocaleString()} (annualized from uploaded actual)`,
    };
    try {
      const r = await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line }) });
      const live = await r.json();
      if (!r.ok) throw new Error(live.error || "Could not add the line.");
      applyLiveBudget(live);
      const key = normVendor(u.vendor);
      const actual: UploadedActual = { vendor: u.vendor, amount: u.amount, period: u.period, note: u.note, sourceName: u.sourceName, engine: u.engine };
      setActuals((prev) => ({ ...prev, [key]: actual }));
      setUnmatched((prev) => prev.filter((x) => normVendor(x.vendor) !== key));
      fetch("/api/budget-actuals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actuals: [{ vendorKey: key, vendor: u.vendor, amount: u.amount, period: u.period, note: u.note, sourceName: u.sourceName, engine: u.engine, uploadedAt: new Date().toISOString() }] }),
      }).catch(() => {});
      auditBudget("Added budget line from actual", u.vendor, `Added ${u.vendor} to the budget (annualized from the uploaded ${usd(u.amount)} actual) and applied the actual.`);
      setBudgetMsg(`Added ${u.vendor} from an uploaded actual.`);
    } catch (e: any) {
      setBudgetErr(e.message);
    }
  }

  function dismissUnmatched(vendor: string) {
    const key = normVendor(vendor);
    setUnmatched((prev) => prev.filter((x) => normVendor(x.vendor) !== key));
  }

  async function resetBudget() {
    try {
      const r = await fetch("/api/budget", { method: "DELETE" });
      const live = await r.json();
      applyLiveBudget(live);
      auditBudget("Reset budget to sample", "Synthetic seed", "Reset the live budget to the shipped synthetic seed lines.");
      setBudgetMsg("Budget reset to the synthetic seed.");
    } catch (e: any) {
      setBudgetErr(e.message);
    }
  }

  // Demo mode: auto-load the sample actuals once the budget has loaded so the
  // "actual" and true-up states are visible alongside scheduled / estimate /
  // outreach, with no manual upload.
  useEffect(() => {
    if (demoMode && !demoRanRef.current && !budgetLoading && budget.length > 0) {
      demoRanRef.current = true;
      loadSampleActuals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, budgetLoading, budget.length]);

  const actualByVendor = actuals;
  const uploadedCount = Object.keys(actualByVendor).length;
  const anyLive = Object.values(actualByVendor).some((a) => a.engine === "live");

  // ---- Derived: accruals with explicit state, and reforecast ----
  const accruals = useMemo(
    () =>
      budget.map((line) => {
        const rec = recordByVendor.get(normVendor(line.vendor));
        const schedule = rec?.extraction.paymentSchedule ?? line.paymentSchedule;
        const scheduledAmount = line.monthlyExpected[CURRENT_MONTH] ?? 0;
        const est = classifyEstimate(schedule);
        const up = actualByVendor[normVendor(line.vendor)];
        if (up) {
          // Real actual in hand. If we would otherwise have accrued an estimate,
          // show the true-up delta so the reconciliation is explicit.
          const trueUp = est !== "outreach" ? up.amount - scheduledAmount : null;
          const src = up.fromInvoices ? "approved invoices" : up.sourceName;
          return {
            vendor: line.vendor,
            kind: "actual" as AccrualKind,
            predicted: up.amount,
            schedule,
            backed: Boolean(rec),
            fromInvoices: Boolean(up.fromInvoices),
            trueUp,
            basis:
              `Actual ${up.note}${up.period ? ` (${up.period})` : ""} from ${src}.` +
              (trueUp != null && trueUp !== 0 ? ` Trued up from the ${usd(scheduledAmount)} estimate (${signedUsd(trueUp)}).` : " Estimate replaced; no outreach needed."),
          };
        }
        if (est === "outreach") {
          return {
            vendor: line.vendor,
            kind: "outreach" as AccrualKind,
            predicted: scheduledAmount,
            schedule,
            backed: Boolean(rec),
            fromInvoices: false,
            trueUp: null,
            basis: `Usage-based schedule "${schedule}". No fixed amount to accrue; confirm the close-period figure with the vendor before posting.`,
          };
        }
        if (est === "scheduled") {
          return {
            vendor: line.vendor,
            kind: "scheduled" as AccrualKind,
            predicted: scheduledAmount,
            schedule,
            backed: Boolean(rec),
            fromInvoices: false,
            trueUp: null,
            basis: `Scheduled accrual from "${schedule}" ${rec ? "(committed ContractIQ record)" : "(budget line)"}. High confidence; trues up when the invoice posts.`,
          };
        }
        return {
          vendor: line.vendor,
          kind: "estimate" as AccrualKind,
          predicted: scheduledAmount,
          schedule,
          backed: Boolean(rec),
          fromInvoices: false,
          trueUp: null,
          basis: `Estimate from "${schedule}". The invoice usually lands after close, so an estimate is accrued now and trued up on receipt.`,
        };
      }),
    [budget, recordByVendor, actualByVendor],
  );

  const reforecast = useMemo(
    () =>
      budget.map((line) => {
        const up = actualByVendor[normVendor(line.vendor)];
        const folded = up && line.actualsToDate[CURRENT_MONTH] === 0;
        const actualsYtd = ytd(line) + (folded ? up!.amount : 0);
        const remaining = line.monthlyExpected.slice(CURRENT_MONTH + 1).reduce((a, b) => a + b, 0);
        const projected = folded ? actualsYtd + remaining : projectedYear(line);
        const variance = projected - line.annualBudget;
        return { vendor: line.vendor, budget: line.annualBudget, actuals: actualsYtd, projected, variance, fromUpload: Boolean(folded) };
      }),
    [budget, actualByVendor],
  );

  const stateCounts = useMemo(() => {
    const c = { actual: 0, scheduled: 0, estimate: 0, outreach: 0 } as Record<AccrualKind, number>;
    for (const a of accruals) c[a.kind]++;
    return c;
  }, [accruals]);

  const backedCount = accruals.filter((a) => a.backed).length;
  const plannerBackedNote =
    budgetSource === "ingested"
      ? `Running off your ingested budget (${budget.length} line${budget.length === 1 ? "" : "s"}).`
      : `Running off the synthetic seed budget (${budget.length} line${budget.length === 1 ? "" : "s"}).`;

  function doExport(fmt: ExportFormat) {
    const accrualsSheet = {
      name: "Draft accruals",
      rows: [
        ["Vendor", "Predicted invoice", "State", "Basis", "Record-backed"],
        ...accruals.map((a) => [a.vendor, usd(a.predicted), actionBadge(a.kind).label, a.basis, a.backed ? "yes" : "no"]),
      ] as (string | number)[][],
    };
    const reforecastSheet = {
      name: "Reforecast vs budget",
      rows: [
        ["Vendor", "Annual budget", "Actuals YTD", "Projected EOY", "Variance"],
        ...reforecast.map((r) => [r.vendor, usd(r.budget), usd(r.actuals), usd(r.projected), signedUsd(r.variance)]),
      ] as (string | number)[][],
    };
    exportSheets([accrualsSheet, reforecastSheet], fmt, "procureiq-planning");
    setExportOpen(false);
  }

  const headerCell: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };
  const inputStyle: React.CSSProperties = { padding: "6px 9px", borderRadius: 6, border: "1px solid #d8dde4", fontSize: 12, color: "#2a3645", background: "#fff", minWidth: 0 };
  const smallBtn: React.CSSProperties = { padding: "5px 11px", borderRadius: 6, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 11, fontWeight: 600, cursor: "pointer" };

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>BudgetIQ, Financial planning</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 11px", color: "#16202e" }}>Quarter-close accrual and reforecast</h2>
          <p style={{ fontSize: 13.5, color: "#5a6675", lineHeight: 1.55, margin: 0, maxWidth: 780 }}>
            Accruals run off a budget you own: seed it, replace it with your CSV/XLSX, or edit it inline. Actuals arrive as
            loose invoices, uploaded or rolled up from the matching queue, and each line says whether it is a real{" "}
            <span style={{ color: "#1f7a5a", fontWeight: 500 }}>actual</span> or an{" "}
            <span style={{ color: "#9a6b00", fontWeight: 500 }}>estimate</span> to be trued up.{" "}
            <span style={{ color: "#2a3645", fontWeight: 500 }}>{plannerBackedNote}</span>
          </p>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setExportOpen((v) => !v)} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
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

      {/* Budget source: the planner-owned budget the whole surface runs off. */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645" }}>Budget source</span>
          <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: budgetSource === "ingested" ? "#e9f4ef" : "#eef1f6", color: budgetSource === "ingested" ? "#1f7a5a" : "#5a7290" }}>
            {budgetSource === "ingested" ? "ingested budget" : "synthetic seed"}
          </span>
          {budgetUpdatedAt && <span style={{ fontSize: 10.5, color: "#9aa3b0" }}>updated {new Date(budgetUpdatedAt).toLocaleString()}</span>}
          {budgetSource === "ingested" && (
            <button onClick={resetBudget} style={{ ...smallBtn, marginLeft: "auto" }}>Reset to sample</button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "stretch", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.5 }}>
              Upload your annual budget (CSV, XLSX, or a prose PDF). Clean spreadsheets are read exactly by a deterministic
              column parser, no model call. Replace the current budget or append to it.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {(["replace", "append"] as const).map((m) => (
                <button key={m} onClick={() => setBudgetMode(m)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${budgetMode === m ? "var(--accent)" : "#d8dde4"}`, background: budgetMode === m ? "#f4faf7" : "#fff", color: budgetMode === m ? "#1f7a5a" : "#5a6675", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div
            onClick={() => budgetFileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setBudgetDragging(true); }}
            onDragLeave={() => setBudgetDragging(false)}
            onDrop={(e) => { e.preventDefault(); setBudgetDragging(false); handleBudgetFiles(e.dataTransfer.files); }}
            style={{ flex: 1, minWidth: 260, border: `1.5px dashed ${budgetDragging ? "var(--accent)" : "#d4d9e0"}`, borderRadius: 9, padding: "14px", textAlign: "center", background: budgetDragging ? "#f4faf7" : "#fafbfc", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            {budgetBusy ? (
              <div style={{ fontSize: 12, color: "#7a8493" }}>Reading budget&hellip;</div>
            ) : (
              <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
                Drop a budget file or click to choose.<br />
                <span style={{ fontSize: 10.5, color: "#a3abb6" }}>CSV, XLSX, PDF &middot; {budgetMode === "replace" ? "replaces the current budget" : "adds to the current budget"}</span>
              </div>
            )}
            <input ref={budgetFileRef} type="file" multiple accept={ACCEPT} style={{ display: "none" }} onChange={(e) => handleBudgetFiles(e.target.files)} />
          </div>
        </div>

        {budgetErr && <div style={{ marginTop: 10, fontSize: 11.5, color: "#b23b3b" }}>{budgetErr}</div>}
        {budgetMsg && !budgetErr && <div style={{ marginTop: 10, fontSize: 11.5, color: "#1f7a5a" }}>{budgetMsg}</div>}

        {/* Editable budget lines */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f3f5" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.6fr 130px", columnGap: 16, padding: "0 4px 8px", ...headerCell }}>
            <div>Vendor</div>
            <div style={{ textAlign: "right" }}>Annual budget</div>
            <div>Payment schedule</div>
            <div style={{ textAlign: "right" }}>Edit</div>
          </div>
          {budget.length === 0 && !budgetLoading && (
            <div style={{ fontSize: 12, color: "#9aa3b0", padding: "8px 4px" }}>No budget lines. Upload a budget or add a line.</div>
          )}
          {budget.map((line) => {
            const key = normVendor(line.vendor);
            const editing = editKey === key;
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.6fr 130px", columnGap: 16, padding: "8px 4px", borderBottom: "1px solid #f6f7f9", alignItems: "center", fontSize: 12.5 }}>
                <div style={{ color: "#2a3645", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.vendor}</div>
                {editing ? (
                  <input value={editAnnual} onChange={(e) => setEditAnnual(e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                ) : (
                  <div className="num" style={{ textAlign: "right", color: "#2a3645" }}>{usd(line.annualBudget)}</div>
                )}
                {editing ? (
                  <input value={editSchedule} onChange={(e) => setEditSchedule(e.target.value)} style={inputStyle} />
                ) : (
                  <div style={{ color: "#7a8493", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.paymentSchedule}</div>
                )}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {editing ? (
                    <>
                      <button onClick={() => saveEdit(line)} style={{ ...smallBtn, color: "#1f7a5a", borderColor: "#bfe0d0" }}>Save</button>
                      <button onClick={() => { setEditKey(null); setBudgetErr(null); }} style={smallBtn}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => beginEdit(line)} style={smallBtn}>Edit</button>
                      <button onClick={() => removeLine(line.vendor)} title="Remove line" style={{ ...smallBtn, color: "#b23b3b", width: 28, padding: "5px 0" }}>&times;</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {adding ? (
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.6fr 130px", columnGap: 16, padding: "10px 4px", alignItems: "center" }}>
              <input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="Vendor name" style={inputStyle} />
              <input value={newAnnual} onChange={(e) => setNewAnnual(e.target.value)} placeholder="240000" style={{ ...inputStyle, textAlign: "right" }} />
              <input value={newSchedule} onChange={(e) => setNewSchedule(e.target.value)} placeholder="Monthly, $20,000 (optional)" style={inputStyle} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={addLine} style={{ ...smallBtn, color: "#1f7a5a", borderColor: "#bfe0d0" }}>Add</button>
                <button onClick={() => { setAdding(false); setBudgetErr(null); }} style={smallBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setAdding(true); setEditKey(null); }} style={{ ...smallBtn, marginTop: 10 }}>+ Add budget line</button>
          )}
        </div>
      </div>

      {/* Upload finance actuals (loose invoices / exports), or roll up approved invoices */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", marginBottom: 4 }}>Actuals</div>
            <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.5 }}>
              Drop an actuals export (CSV, XLSX, or PDF, a batch or a single file) or roll up the invoices already approved in
              matching. Each figure lands on its vendor's budget line and replaces the estimate.
            </div>
            <div style={{ marginTop: 10 }}>
              <button onClick={rollupInvoices} disabled={rollupBusy} style={{ ...smallBtn, opacity: rollupBusy ? 0.6 : 1 }}>
                {rollupBusy ? "Rolling up…" : "Roll up approved invoices"}
              </button>
              {rollupMsg && <div style={{ marginTop: 8, fontSize: 11, color: "#5a6675", lineHeight: 1.45 }}>{rollupMsg}</div>}
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
                Drop an actuals export or click to choose.<br />
                <span style={{ fontSize: 10.5, color: "#a3abb6" }}>CSV, XLSX, PDF, DOCX, TXT</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 9 }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={smallBtn}>Choose file</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); loadSampleActuals(); }} style={smallBtn}>Try a sample</button>
            </div>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
        {uploadError && <div style={{ marginTop: 12, fontSize: 11.5, color: "#b23b3b" }}>{uploadError}</div>}
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

        {/* Unmatched actuals: a figure whose vendor is not in the budget. */}
        {unmatched.length > 0 && (
          <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid #f1f3f5" }}>
            <div style={{ fontSize: 11.5, color: "#9a6b00", fontWeight: 600, marginBottom: 8 }}>
              {unmatched.length} actual{unmatched.length === 1 ? "" : "s"} matched no budget line
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unmatched.map((u) => (
                <div key={normVendor(u.vendor)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "#fffaf0", border: "1px solid #f0e6d2", borderRadius: 7 }}>
                  <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{u.vendor}</span>
                  <span className="num" style={{ fontSize: 11.5, color: "#5a6675", whiteSpace: "nowrap" }}>{usd(u.amount)}</span>
                  <span style={{ fontSize: 10.5, color: "#9aa3b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{`${u.note}${u.period ? ` (${u.period})` : ""} from ${u.sourceName}`}</span>
                  <button onClick={() => addUnmatchedToBudget(u)} style={{ ...smallBtn, marginLeft: "auto", color: "#1f7a5a", borderColor: "#bfe0d0", flexShrink: 0 }}>Add to budget</button>
                  <button onClick={() => dismissUnmatched(u.vendor)} title="Dismiss" style={{ ...smallBtn, width: 28, padding: "5px 0", color: "#9aa3b0", flexShrink: 0 }}>&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadedCount > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f3f5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 600 }}>{uploadedCount} actual{uploadedCount === 1 ? "" : "s"} applied to budget lines</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#e9f4ef", color: "#1f7a5a" }}>saved, survives restart</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: anyLive ? "#ece9f9" : "#f1f3f5", color: anyLive ? "#5b54a3" : "#5a6675" }}>{anyLive ? "parsed by model" : "parsed offline"}</span>
              <button onClick={clearUploads} style={{ ...smallBtn, marginLeft: "auto", color: "#7a8493" }}>Clear all</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(actualByVendor).map(([vendorKey, a]) => (
                <div key={vendorKey} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 7 }}>
                  <span style={{ fontSize: 11.5, color: "#2a3645", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.vendor}</span>
                  {a.fromInvoices && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#eef1fb", color: "#3a5fb0", flexShrink: 0 }}>invoice</span>}
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "0 0 12px" }}>
        <h3 className="serif" style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#16202e" }}>Draft accruals, {MONTHS[CURRENT_MONTH]} quarter close</h3>
        <span style={{ fontSize: 11, color: "#7a8493" }}>
          {stateCounts.actual} actual &middot; {stateCounts.scheduled} scheduled &middot; {stateCounts.estimate} estimate &middot; {stateCounts.outreach} outreach
          {backedCount > 0 ? ` · ${backedCount} record-backed` : ""}
        </span>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 2fr 1.05fr", columnGap: 36, padding: "11px 20px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", ...headerCell }}>
          <div>Vendor</div>
          <div style={{ textAlign: "right" }}>Predicted invoice</div>
          <div>Basis</div>
          <div style={{ textAlign: "right" }}>State</div>
        </div>
        {accruals.map((a) => {
          const badge = actionBadge(a.kind);
          return (
            <div key={a.vendor} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 2fr 1.05fr", columnGap: 36, padding: "var(--row-pad,14px 20px)", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#2a3645", fontWeight: 500 }}>{a.vendor}</span>
                {a.kind === "actual" && a.fromInvoices && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#eef1fb", color: "#3a5fb0" }}>invoice</span>}
                {a.backed && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: "#e9f4ef", color: "#1f7a5a" }}>record</span>}
              </div>
              <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 500 }}>
                {usd(a.predicted)}
                {a.trueUp != null && a.trueUp !== 0 && (
                  <span style={{ display: "block", fontSize: 9.5, fontWeight: 600, color: a.trueUp > 0 ? "#b23b3b" : "#1f7a5a" }}>{signedUsd(a.trueUp)} true-up</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.4, paddingLeft: 18, borderLeft: "1px solid #eef0f3" }}>{a.basis}</div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 6, whiteSpace: "nowrap", background: badge.bg, color: badge.fg }}>{badge.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reforecast vs budget */}
      <h3 className="serif" style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#16202e" }}>Reforecast vs budget</h3>
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
            <div className="num" style={{ textAlign: "right", fontWeight: 600, color: r.variance > 0 ? "#b23b3b" : "#1f7a5a" }}>{signedUsd(r.variance)}</div>
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
