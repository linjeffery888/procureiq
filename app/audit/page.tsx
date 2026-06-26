"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { AuditEvent, AuditModule, AuditAction } from "@/lib/types";
import { exportSheets, ExportFormat } from "@/lib/export";
import { auditToSheet, formatAuditTime } from "@/lib/auditClient";

// The Audit Trail surface: one append-only ledger of every human touchpoint
// across both modules. ContractIQ commits, BudgetIQ invoice approvals / manual
// corrections / reopens, budget actuals, and clause-threshold edits all land
// here as immutable events. The trail is persisted to disk (data/audit-log.json)
// so it survives reloads and restarts, and is exportable as a real spreadsheet
// for a compliance reviewer. This is the "who decided what, and when" record the
// stakeholders asked for, in one place, downloadable.

// Module tag colors, reusing the palette the rest of the app uses for the two
// products so the trail reads consistently with the module surfaces.
const MODULE_STYLE: Record<AuditModule, { bg: string; fg: string }> = {
  ContractIQ: { bg: "#eaf1f8", fg: "#2e6da4" },
  BudgetIQ: { bg: "#e9f4ef", fg: "#1f7a5a" },
};

// Outcome tag colors: a clean pass / resolved reads green; a human-accepted or
// override reads amber (a person had to step in); a reopen reads neutral.
function outcomeStyle(outcome: string): { bg: string; fg: string } {
  const o = outcome.toLowerCase();
  if (o === "clean-pass" || o === "resolved" || o === "applied") return { bg: "#e9f4ef", fg: "#1f7a5a" };
  if (o === "human-accepted" || o === "override") return { bg: "#fbf4e3", fg: "#9a6b00" };
  if (o === "reopened") return { bg: "#f1eef8", fg: "#6a5aa0" };
  return { bg: "#eef1f6", fg: "#5a7290" };
}

const ACTION_LABELS: Record<AuditAction | "all", string> = {
  all: "All actions",
  "contract-committed": "Contract committed",
  "invoice-approved": "Invoice approved",
  "invoice-corrected": "Manual correction",
  "invoice-reopened": "Reopened",
  "budget-actuals": "Budget actuals applied",
  "budget-updated": "Budget updated",
  "thresholds-changed": "Thresholds changed",
  "po-updated": "PO register edited",
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<"all" | AuditModule>("all");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the audit trail.");
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Apply the module / action / free-text filters. The store already returns
  // newest-first, so we preserve order.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (q) {
        const hay = `${e.subject} ${e.actor} ${e.surface} ${e.actionLabel} ${e.outcome} ${e.detail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, moduleFilter, actionFilter, query]);

  // Headline counts for the summary tiles, computed over the WHOLE ledger (not
  // the filtered view) so the tiles read as the standing totals.
  const totals = useMemo(() => {
    const t = {
      total: events.length,
      contractIq: 0,
      budgetIq: 0,
      humanTouched: 0, // anything that required a person stepping in
    };
    for (const e of events) {
      if (e.module === "ContractIQ") t.contractIq++;
      else if (e.module === "BudgetIQ") t.budgetIq++;
      const o = e.outcome.toLowerCase();
      if (o === "human-accepted" || o === "override" || e.action === "invoice-corrected") t.humanTouched++;
    }
    return t;
  }, [events]);

  function doExport(fmt: ExportFormat) {
    // Export the FILTERED view, so a reviewer can hand off exactly the slice on
    // screen (e.g. only ContractIQ, or only overrides).
    exportSheets([auditToSheet(filtered)], fmt, "procureiq-audit-trail");
    setExportOpen(false);
  }

  async function clearLedger() {
    if (!window.confirm("Clear the entire audit trail? This permanently removes every recorded touchpoint and cannot be undone.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/audit", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not clear the audit trail.");
      setEvents([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClearing(false);
    }
  }

  const btn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
  const headerCell: CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };
  const selectStyle: CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 500 };

  // The grid template shared by the table header and every row.
  const GRID = "150px 104px 1.1fr 1fr 0.95fr 0.95fr 2fr";

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 20 }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>Shared · Compliance</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 10px", color: "#16202e" }}>Audit trail</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#5a6675", margin: 0 }}>
            Every human touchpoint across ContractIQ and BudgetIQ, in one permanent ledger: which contracts were committed
            clean or human-accepted, which invoices a person approved or corrected by hand, which budget actuals were
            applied, and any change to the clause thresholds. The record persists across sessions and downloads as a
            spreadsheet for review.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setExportOpen((v) => !v)} disabled={filtered.length === 0} style={{ ...btn, display: "flex", alignItems: "center", gap: 7, opacity: filtered.length === 0 ? 0.55 : 1 }}>
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
          <button onClick={refresh} disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { label: "Total touchpoints", value: totals.total, sub: "logged across both modules" },
          { label: "ContractIQ", value: totals.contractIq, sub: "contract commits" },
          { label: "BudgetIQ", value: totals.budgetIq, sub: "invoice + budget actions" },
          { label: "Required a person", value: totals.humanTouched, sub: "human-accepted or overridden" },
        ].map((tile) => (
          <div key={tile.label} style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#9aa3b0", marginBottom: 7 }}>{tile.label}</div>
            <div className="serif num" style={{ fontSize: 28, fontWeight: 600, color: "#16202e", letterSpacing: "-.5px" }}>{tile.value}</div>
            <div style={{ fontSize: 11.5, color: "#8893a2", marginTop: 4 }}>{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as any)} style={selectStyle}>
          <option value="all">All modules</option>
          <option value="ContractIQ">ContractIQ</option>
          <option value="BudgetIQ">BudgetIQ</option>
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as any)} style={selectStyle}>
          {(Object.keys(ACTION_LABELS) as (AuditAction | "all")[]).map((k) => (
            <option key={k} value={k}>{ACTION_LABELS[k]}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendor, invoice, actor, detail…"
          style={{ ...selectStyle, flex: 1, minWidth: 220, fontWeight: 400 }}
        />
        <span style={{ fontSize: 12, color: "#8893a2" }}>
          {filtered.length} of {events.length} shown
        </span>
        <button onClick={clearLedger} disabled={clearing || events.length === 0} title="Permanently clear the entire trail (fresh-demo reset)" style={{ ...btn, color: "#b4504a", borderColor: "#e7cdcb", opacity: clearing || events.length === 0 ? 0.5 : 1 }}>
          {clearing ? "Clearing…" : "Clear trail"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fdf1f0", border: "1px solid #f3d5d2", borderRadius: 9, padding: "12px 16px", marginBottom: 14, fontSize: 12.5, color: "#a4453d" }}>{error}</div>
      )}

      {/* Ledger table */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "11px 18px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", ...headerCell }}>
          <div>When</div>
          <div>Module</div>
          <div>Action</div>
          <div>Subject</div>
          <div>Outcome</div>
          <div>Reviewer</div>
          <div>Detail</div>
        </div>
        {loading ? (
          <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 13, color: "#9aa3b0" }}>Loading the trail…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 13, color: "#9aa3b0" }}>
            {events.length === 0
              ? "No touchpoints yet. Commit a contract, approve or correct an invoice, or apply budget actuals, and it appears here."
              : "No events match these filters."}
          </div>
        ) : (
          filtered.map((e) => {
            const ms = MODULE_STYLE[e.module];
            const os = outcomeStyle(e.outcome);
            return (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: GRID, padding: "13px 18px", borderBottom: "1px solid #f3f4f6", alignItems: "start", fontSize: 12.5 }}>
                <div className="num" style={{ color: "#5a6675", whiteSpace: "nowrap" }}>{formatAuditTime(e.at)}</div>
                <div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 5, background: ms.bg, color: ms.fg, whiteSpace: "nowrap" }}>{e.module}</span>
                </div>
                <div style={{ color: "#2a3645" }}>
                  <div style={{ fontWeight: 600 }}>{e.actionLabel}</div>
                  <div style={{ fontSize: 11, color: "#9aa3b0", marginTop: 2 }}>{e.surface}</div>
                </div>
                <div style={{ color: "#2a3645", fontWeight: 500, paddingRight: 8 }}>{e.subject}</div>
                <div>
                  {e.outcome && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 5, background: os.bg, color: os.fg, textTransform: "uppercase", letterSpacing: ".3px", whiteSpace: "nowrap" }}>{e.outcome}</span>
                  )}
                </div>
                <div style={{ paddingRight: 8 }}>
                  {e.actor ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#2a3645", fontWeight: 500 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#eef2f7", color: "#2e6da4", fontSize: 10, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                        {e.actor.trim().charAt(0)}
                      </span>
                      <span>{e.actor}</span>
                    </span>
                  ) : (
                    <span style={{ color: "#b9c0c9", fontStyle: "italic" }}>unattributed</span>
                  )}
                </div>
                <div style={{ color: "#6a7484", lineHeight: 1.5, paddingRight: 4 }}>{e.detail}</div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ fontSize: 11.5, color: "#9aa3b0", marginTop: 12, lineHeight: 1.5 }}>
        Append-only ledger, persisted to disk. Events are never edited, only added; the export reflects the filters above.
      </div>
    </div>
  );
}
