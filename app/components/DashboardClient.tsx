"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { INVOICES, PURCHASE_ORDERS, BUDGET_LINES } from "@/lib/mockData";
import { matchAllDeterministic } from "@/lib/matching";
import { contractReview } from "@/lib/costModel";
import type { MatchResult, MatchStatus, TriageResponse } from "@/lib/types";

// The platform dashboard as an OVERVIEW WORKBENCH. The top is a live read of what
// is happening across both modules: the KPI strip, then portfolio analytics (the
// "At a glance" band), then the work that needs a human (the expandable buckets),
// and finally the one-record lifecycle. Every figure is computed from the same
// live state the working surfaces use: the persisted triage run, committed
// records, the corpus, and the budget lines plus uploaded actuals. When a store
// is empty it falls back to the deterministic baseline so the page is never blank.

// ---------------------------------------------------------------------------
// Formatting + small helpers
// ---------------------------------------------------------------------------
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
function usdCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
function signedUsd(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function normVendor(name: string | null | undefined): string {
  return (name || "").toLowerCase().replace(/[.,]/g, " ").replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ").replace(/\s+/g, " ").trim();
}
function shortVendor(v: string): string {
  return v.replace(/,?\s*(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|solutions|services|systems|analytics|cloud|infrastructure)\.?$/i, "").trim() || v;
}

const CURRENT_MONTH = 5; // June, 0-indexed
function sum(a: number[]): number {
  return a.reduce((x, y) => x + y, 0);
}

const STATUS_LABEL: Record<MatchStatus, string> = { matched: "matched", review: "review", over_budget: "over budget", no_po: "no PO" };

// ---------------------------------------------------------------------------
// Live data: fetched shapes
// ---------------------------------------------------------------------------
interface RecordLite {
  vendor: string | null;
  extraction: { counterpartyType: string | null; totalValue: number | null; paymentSchedule: string | null };
}
interface ActualLite {
  vendorKey: string;
  amount: number;
}
interface CorpusLite {
  total: number;
  passCount: number;
  flagCount: number;
  unlabeledCount: number;
}

// The deterministic baseline, computed once. Used until the live triage run loads
// (and as the fallback when no run has been saved yet).
const BASELINE = matchAllDeterministic(INVOICES, PURCHASE_ORDERS);

// ---------------------------------------------------------------------------
// Lifecycle stations (the bottom diagram) + module cards
// ---------------------------------------------------------------------------
interface Station { module: string; title: string; sub: string; tagColor: string; dot: string; ring: string }
const LIFECYCLE: Station[] = [
  { module: "ContractIQ", title: "Contract extracted", sub: "Read once at signing against the playbook.", tagColor: "#2e6da4", dot: "#2e6da4", ring: "#e1ebf6" },
  { module: "Procurement", title: "PO / work order", sub: "A purchase order is raised.", tagColor: "#5a7290", dot: "#5a7290", ring: "#e8ecf2" },
  { module: "BudgetIQ", title: "Invoice matched", sub: "AP matches the invoice to the PO.", tagColor: "#1f7a5a", dot: "#2f9e78", ring: "#dcefe7" },
  { module: "BudgetIQ", title: "Accrual drafted", sub: "Finance accrues from the schedule.", tagColor: "#1f7a5a", dot: "#2f9e78", ring: "#dcefe7" },
];
const NODE_DELAYS = ["0.2s", "1.95s", "3.9s", "6.3s"];

interface ModuleCard { href: string; tag: string; title: string; desc: string; tagColor: string; iconBg: string; iconFg: string; icon: ReactNode }
const MODULE_CARDS: ModuleCard[] = [
  { href: "/contract-review", tag: "ContractIQ", title: "Contract review", desc: "First-pass review against the standard-terms playbook.", tagColor: "#2e6da4", iconBg: "#eaf1fa", iconFg: "#2e6da4",
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></svg>) },
  { href: "/invoice-matching", tag: "BudgetIQ", title: "Invoice check", desc: "Match invoices to POs and route exceptions to a human.", tagColor: "#1f7a5a", iconBg: "#e7f3ee", iconFg: "#1f7a5a",
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M8 14h4" /></svg>) },
  { href: "/financial-planning", tag: "BudgetIQ", title: "Budget planning", desc: "Draft quarter-close accruals and the reforecast.", tagColor: "#1f7a5a", iconBg: "#e7f3ee", iconFg: "#1f7a5a",
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5M4 19h16" /><path d="M8 16l4-5 3 3 4-6" /></svg>) },
  { href: "/knowledge", tag: "Knowledge", title: "Precedent corpus", desc: "Curate precedent, index it, and check retrieval accuracy.", tagColor: "#5a7290", iconBg: "#eef1f6", iconFg: "#5a7290",
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z" /><path d="M4 17h14" /></svg>) },
];

const card: CSSProperties = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10 };
const cardLabel: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "#2a3645" };
const cardSub: CSSProperties = { fontSize: 11, color: "#9aa3b0", marginTop: 2 };
const sectionEyebrow: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#16202e", textTransform: "uppercase", letterSpacing: ".6px" };
const thCell: CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };

// ---------------------------------------------------------------------------
// Reusable charts
// ---------------------------------------------------------------------------
function Donut({ segments, center, sub }: { segments: { pct: number; color: string }[]; center: string; sub: string }) {
  let acc = 0;
  const stops = segments
    .filter((s) => s.pct > 0)
    .map((s) => { const from = acc; acc += s.pct; return `${s.color} ${from}% ${acc}%`; })
    .join(", ");
  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <div style={{ width: 88, height: 88, borderRadius: "50%", background: stops ? `conic-gradient(${stops})` : "#eef0f3" }} />
      <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "#fff" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="num serif" style={{ fontSize: 18, fontWeight: 600, color: "#16202e", lineHeight: 1 }}>{center}</div>
        <div style={{ fontSize: 8.5, color: "#8893a2", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function Legend({ rows }: { rows: { color: string; label: string; detail: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
      {rows.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: l.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: "#5a6675", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
          <span className="num" style={{ fontSize: 11.5, color: "#9aa3b0", marginLeft: "auto" }}>{l.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function DashboardClient() {
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [records, setRecords] = useState<RecordLite[]>([]);
  const [actuals, setActuals] = useState<ActualLite[]>([]);
  const [corpus, setCorpus] = useState<CorpusLite | null>(null);
  // The live budget the Financial Planning page runs off (data/budget.json), so
  // the reforecast on this dashboard matches that page instead of the seed lines.
  const [budget, setBudget] = useState<typeof BUDGET_LINES>([]);
  const [varianceOpen, setVarianceOpen] = useState(false); // collapse/expand the variance list
  const [openBucket, setOpenBucket] = useState<string | null>("invoices");

  // Pull the live state every store exposes. Each is optional: the page renders
  // the deterministic baseline immediately and upgrades to live data as it lands.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, r, a, c, b] = await Promise.all([
          fetch("/api/triage").then((x) => (x.ok ? x.json() : null)).catch(() => null),
          fetch("/api/records").then((x) => (x.ok ? x.json() : null)).catch(() => null),
          fetch("/api/budget-actuals").then((x) => (x.ok ? x.json() : null)).catch(() => null),
          fetch("/api/corpus").then((x) => (x.ok ? x.json() : null)).catch(() => null),
          fetch("/api/budget").then((x) => (x.ok ? x.json() : null)).catch(() => null),
        ]);
        if (!alive) return;
        if (t?.result?.results) setTriage(t.result as TriageResponse);
        if (Array.isArray(r?.records)) setRecords(r.records);
        if (Array.isArray(a?.actuals)) setActuals(a.actuals);
        if (c?.status) setCorpus(c.status);
        if (Array.isArray(b?.lines)) setBudget(b.lines);
      } catch {
        /* keep the baseline */
      }
    })();
    return () => { alive = false; };
  }, []);

  const m = useMemo(() => buildModel({ triage, records, actuals, corpus, budget }), [triage, records, actuals, corpus, budget]);

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-.4px", margin: "0 0 6px", color: "#16202e" }}>Overview</h1>
          <div style={{ fontSize: 13, color: "#7a8493" }}>
            Live work queue across ContractIQ and BudgetIQ <span style={{ color: "#c7ced6" }}>&middot;</span> <span style={{ color: "#5a6675", fontWeight: 500 }}>{m.quarterLabel}</span>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 7, background: m.live ? "#e9f4ef" : "#f1f3f5", border: `1px solid ${m.live ? "#cfe3d8" : "#e3e6ea"}` }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.live ? "#2f9e78" : "#9aa3b0" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: m.live ? "#1f7a5a" : "#5a6675" }}>{m.live ? "Live engine" : "Offline engine"}</span>
        </span>
      </div>

      {/* KPI strip */}
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13 }}>
        {m.kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: "15px 17px" }}>
            <div style={{ fontSize: 11, color: "#8893a2", marginBottom: 9 }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div className="num serif" style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-.4px", color: "#16202e", lineHeight: 1 }}>{k.value}</div>
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: k.deltaBg, color: k.deltaFg, whiteSpace: "nowrap" }}>{k.delta}</span>
            </div>
            <div style={{ fontSize: 11, color: "#9aa3b0", marginTop: 8 }}>{k.foot}</div>
          </div>
        ))}
      </div>

      {/* Analytics band */}
      <div style={{ marginTop: 26, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={sectionEyebrow}>At a glance</span>
        <span style={{ fontSize: 12, color: "#9aa3b0" }}>portfolio analytics across both modules</span>
      </div>

      {/* Row 1: bar charts */}
      <div style={{ marginTop: 13, display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 14, alignItems: "start" }}>
        {/* contracts ingested by type */}
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={cardLabel}>Contracts ingested by type</div>
            <div className="num" style={{ fontSize: 11.5, color: "#7a8493" }}>{m.ctTotal} total</div>
          </div>
          <div style={cardSub}>trailing 90 days, modeled from discovery volume</div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: `repeat(${m.contractTypes.length},1fr)`, gap: 12, alignItems: "end", height: 116 }}>
            {m.contractTypes.map((t) => (
              <div key={t.type} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div className="num" style={{ fontSize: 11.5, fontWeight: 600, color: "#2a3645", marginBottom: 5 }}>{t.n}</div>
                <div style={{ width: "72%", maxWidth: 34, height: `${t.h}%`, minHeight: 4, borderRadius: "4px 4px 0 0", background: t.color }} />
                <div style={{ fontSize: 10, color: "#7a8493", marginTop: 7, textAlign: "center", lineHeight: 1.25 }}>{t.type}</div>
              </div>
            ))}
          </div>
        </div>

        {/* budget variance by vendor */}
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={cardLabel}>Budget variance by vendor</div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ fontSize: 10.5, color: "#7a8493", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#2f9e78" }} />under</span>
              <span style={{ fontSize: 10.5, color: "#7a8493", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#c0504d" }} />over</span>
            </div>
          </div>
          <div style={cardSub}>projected end-of-year vs annual budget</div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
            {(varianceOpen ? m.varianceRows : m.varianceRows.slice(0, 8)).map((v) => (
              <div key={v.vendor} style={{ display: "grid", gridTemplateColumns: "0.95fr 1.7fr 0.7fr", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 11, color: "#5a6675", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.short}</div>
                <div style={{ position: "relative", height: 16, background: "#f4f6f8", borderRadius: 4 }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#d3d9e0" }} />
                  <div style={{ position: "absolute", top: 3, bottom: 3, left: `${v.barLeft}%`, width: `${v.barWidth}%`, minWidth: 2, background: v.color, borderRadius: 3 }} />
                </div>
                <div className="num" style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: v.color }}>{v.label}</div>
              </div>
            ))}
            {m.varianceRows.length > 8 && (
              <button
                onClick={() => setVarianceOpen((o) => !o)}
                style={{ marginTop: 6, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0 1px", background: "none", border: "none", borderTop: "1px solid #eef0f3", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#5a6675" }}
              >
                {varianceOpen ? "Show top movers" : `Show all ${m.varianceRows.length} vendors`}
                <span style={{ fontSize: 9, color: "#9aa3b0", transform: varianceOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: distributions */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={cardLabel}>Contract review outcomes</div>
          <div style={cardSub}>first pass, {corpus ? `${corpus.total} precedents` : "seeded corpus"}</div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <Donut segments={m.outcomeDonut} center={m.outcomePct} sub="clean" />
            <Legend rows={m.outcomeLegend} />
          </div>
        </div>

        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={cardLabel}>Invoice triage mix</div>
          <div style={cardSub}>this run, {m.triageTotal} invoices</div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <Donut segments={m.triageDonut} center={m.triagePct} sub="cleared" />
            <Legend rows={m.triageLegend} />
          </div>
        </div>

        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={cardLabel}>Why invoices route to a human</div>
          <div style={cardSub}>share of exceptions, this run</div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {m.exceptionReasons.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "#9aa3b0", paddingTop: 8 }}>No exceptions in the current run.</div>
            ) : m.exceptionReasons.map((r) => (
              <div key={r.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11.5, color: "#5a6675" }}>{r.label}</span>
                  <span className="num" style={{ fontSize: 11.5, color: "#7a8493" }}>{r.pctLabel}</span>
                </div>
                <div style={{ height: 6, background: "#f1f3f5", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: r.width, background: r.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Needs attention */}
      <div style={{ marginTop: 28, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={sectionEyebrow}>Needs attention</span>
        <span style={{ fontSize: 12, color: "#9aa3b0" }}>expand a bucket for the line-item breakdown</span>
      </div>
      <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 12 }}>
        {m.buckets.map((b) => {
          const expanded = openBucket === b.key;
          return (
            <div key={b.key} style={{ ...card, borderColor: expanded ? "#cdd3db" : "#e6e8ec", overflow: "hidden", boxShadow: expanded ? "0 4px 14px rgba(20,30,45,.05)" : "none" }}>
              <button onClick={() => setOpenBucket((c) => (c === b.key ? null : b.key))} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: b.accentBg, color: b.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{b.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2a38" }}>{b.label}</div>
                  <div style={{ fontSize: 11.5, color: "#8893a2", marginTop: 1 }}>{b.sub}</div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right", display: "flex", alignItems: "baseline", gap: 5 }}>
                  <div className="num serif" style={{ fontSize: 22, fontWeight: 600, color: b.valueColor }}>{b.value}</div>
                  <div style={{ fontSize: 10.5, color: "#9aa3b0" }}>{b.unit}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: b.chipBg, color: b.chipFg, whiteSpace: "nowrap" }}>{b.chip}</span>
                <span style={{ fontSize: 11, color: "#aab2bd", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>&#9662;</span>
              </button>
              {expanded && (
                <div style={{ borderTop: "1px solid #eef0f3" }}>
                  <div style={{ display: "grid", gridTemplateColumns: b.cols.map((c) => c.w).join(" "), columnGap: 18, padding: "10px 18px", background: "#fafbfc", borderBottom: "1px solid #eef0f3" }}>
                    {b.cols.map((c, i) => (<div key={i} style={{ ...thCell, textAlign: c.align }}>{c.label}</div>))}
                  </div>
                  {b.rows.length === 0 ? (
                    <div style={{ padding: "16px 18px", fontSize: 12, color: "#9aa3b0" }}>{b.empty}</div>
                  ) : b.rows.map((row, ri) => (
                    <div key={ri} style={{ display: "grid", gridTemplateColumns: b.cols.map((c) => c.w).join(" "), columnGap: 18, padding: "11px 18px", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
                      {row.map((cell, ci) => (
                        <div key={ci} className={cell.mono ? "mono" : cell.num ? "num" : undefined} style={{ textAlign: b.cols[ci].align, color: cell.color ?? "#5a6675", fontWeight: cell.weight ?? 400, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: cell.wrap ? "normal" : "nowrap", fontSize: cell.mono ? 11.5 : undefined }}>
                          {cell.pill ? <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: cell.pillBg, color: cell.pillFg, whiteSpace: "nowrap" }}>{cell.text}</span> : cell.text}
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: "#fafbfc" }}>
                    <div style={{ fontSize: 11.5, color: "#8893a2" }}>{b.footNote}</div>
                    <Link href={b.href} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--navy,#1f3a5f)", padding: "8px 14px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>{b.cta}<span>&rarr;</span></Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lifecycle flow */}
      <FlowDiagram />

      {/* Module quick-launch */}
      <div style={{ marginTop: 26, ...sectionEyebrow, color: "#8893a2" }}>Jump into a module</div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {MODULE_CARDS.map((mc) => (
          <Link key={mc.href} href={mc.href} className="pq-card-hover" style={{ ...card, padding: "18px 18px", cursor: "pointer", display: "flex", flexDirection: "column", minHeight: 162 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: mc.iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 13, color: mc.iconFg }}>{mc.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: mc.tagColor, marginBottom: 5 }}>{mc.tag}</div>
            <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38", marginBottom: 6 }}>{mc.title}</div>
            <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5, flex: 1 }}>{mc.desc}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginTop: 12, display: "flex", alignItems: "center", gap: 5 }}>Open<span style={{ fontSize: 13 }}>&rarr;</span></div>
          </Link>
        ))}
      </div>

      {/* Impact + audit links */}
      <Link href="/impact" className="pq-card-hover" style={{ ...card, marginTop: 22, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "#f1f3f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#5a6675" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2a38" }}>Business case and ROI</div>
            <div style={{ fontSize: 12, color: "#8893a2" }}>Hours recovered and throughput, every figure tagged verified / assumption / estimate.</div>
          </div>
        </div>
        <span style={{ color: "#aab2bd", fontSize: 18 }}>&rarr;</span>
      </Link>
      <Link href="/audit" className="pq-card-hover" style={{ ...card, marginTop: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "#f1f3f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#5a6675" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 12l2 2 4-4" /><path d="M5 3h11l4 4v14H5z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2a38" }}>Audit trail</div>
            <div style={{ fontSize: 12, color: "#8893a2" }}>Every human touchpoint across both modules, persisted and downloadable for compliance.</div>
          </div>
        </div>
        <span style={{ color: "#aab2bd", fontSize: 18 }}>&rarr;</span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The model: every analytic computed from live state, with baseline fallbacks.
// ---------------------------------------------------------------------------
interface BuildInput { triage: TriageResponse | null; records: RecordLite[]; actuals: ActualLite[]; corpus: CorpusLite | null; budget: typeof BUDGET_LINES }

function buildModel({ triage, records, actuals, corpus, budget }: BuildInput) {
  const results: MatchResult[] = triage?.results?.length ? triage.results : BASELINE;
  const live = triage ? triage.meta.engine !== "offline-deterministic" : false;
  const total = results.length;
  const matched = results.filter((r) => r.status === "matched" && !r.duplicate?.isDuplicate).length;
  const exceptions = results.filter((r) => r.needsHuman);
  const reviewCount = results.filter((r) => r.status === "review").length;

  // --- Budget reforecast (live budget + any uploaded actuals) ---
  // Run off the live budget the Financial Planning page uses (data/budget.json via
  // /api/budget); fall back to the seed lines until it lands so the baseline render
  // is never empty. This keeps the dashboard's net variance and over-plan count in
  // agreement with the planning page instead of a stale 4-vendor seed.
  const budgetLines = budget.length ? budget : BUDGET_LINES;
  const actualByVendor = new Map(actuals.map((a) => [a.vendorKey, a.amount]));
  const reforecast = budgetLines.map((l) => {
    const up = actualByVendor.get(normVendor(l.vendor));
    const folded = up != null && l.actualsToDate[CURRENT_MONTH] === 0;
    const actualsYtd = sum(l.actualsToDate) + (folded ? up! : 0);
    const remaining = l.monthlyExpected.slice(folded ? CURRENT_MONTH + 1 : CURRENT_MONTH).reduce((a, b) => a + b, 0);
    const projected = actualsYtd + remaining;
    return { vendor: l.vendor, budget: l.annualBudget, projected, variance: projected - l.annualBudget };
  });
  const netVariance = reforecast.reduce((a, r) => a + r.variance, 0);
  const overPlan = reforecast.filter((r) => r.variance > 0);

  // --- KPIs ---
  const cr = contractReview();
  const openPoBalance = PURCHASE_ORDERS.reduce((a, p) => a + p.remaining, 0);
  const cycleDelta = Math.round(((cr.currentCycleDays - cr.projectedCycleDays) / cr.currentCycleDays) * 100);
  const kpis = [
    { label: "Auto-cleared this run", value: `${matched}/${total}`, delta: live ? "AI on" : "rules", deltaBg: live ? "#e9f4ef" : "#eef1f6", deltaFg: live ? "#1f7a5a" : "#5a7290", foot: "invoice matching" },
    { label: "Touchless match rate", value: pct(total ? matched / total : 0), delta: `${exceptions.length} to review`, deltaBg: exceptions.length ? "#fbf4e3" : "#e9f4ef", deltaFg: exceptions.length ? "#9a6b00" : "#1f7a5a", foot: "clean, no human touch" },
    { label: "Avg review cycle", value: `${cr.projectedCycleDays} d`, delta: `-${cycleDelta}%`, deltaBg: "#e9f4ef", deltaFg: "#1f7a5a", foot: "first pass, signing to commit" },
    { label: "Commitments in flight", value: usdCompact(openPoBalance), delta: `${PURCHASE_ORDERS.length} open POs`, deltaBg: "#eef1f6", deltaFg: "#5a7290", foot: "open PO balance" },
  ];

  // --- Contracts ingested by type (modeled from discovery volume + Ben's stated
  //     frequency order: licenses > SOWs > MSAs > NDAs) ---
  const ctTotal = Math.round(cr.annualStandardContracts / 4); // ~one quarter (trailing 90d)
  const typeMix = [
    { type: "License renewal", share: 0.44, color: "#2e6da4" },
    { type: "Statement of work", share: 0.24, color: "#1f7a5a" },
    { type: "MSA", share: 0.18, color: "#5a7290" },
    { type: "NDA", share: 0.14, color: "#b9c2cd" },
  ];
  const ctCounts = typeMix.map((t) => ({ ...t, n: Math.round(ctTotal * t.share) }));
  const ctMax = Math.max(...ctCounts.map((t) => t.n), 1);
  const contractTypes = ctCounts.map((t) => ({ type: t.type, n: t.n, color: t.color, h: Math.round((t.n / ctMax) * 100) }));
  const ctSum = ctCounts.reduce((a, t) => a + t.n, 0);

  // --- Budget variance bars (centered at 0), biggest movers first. The glance
  //     card shows a handful collapsed and expands to the full 37 on demand
  //     (toggle in the render), so it never runs off-screen by default. ---
  const sortedVariance = [...reforecast].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const maxAbs = Math.max(...sortedVariance.map((r) => Math.abs(r.variance)), 1);
  const varianceRows = sortedVariance.map((r) => {
    const frac = Math.abs(r.variance) / maxAbs;
    const half = frac * 50;
    const over = r.variance > 0;
    return {
      vendor: r.vendor, short: shortVendor(r.vendor),
      barLeft: over ? 50 : 50 - half, barWidth: half,
      label: signedUsd(r.variance), color: over ? "#c0504d" : "#2f9e78",
    };
  });

  // --- Contract review outcomes donut (corpus pass / flag / unlabeled) ---
  const c = corpus ?? { total: 8, passCount: 3, flagCount: 5, unlabeledCount: 0 };
  const cTotal = Math.max(c.total, 1);
  const outcomeDonut = [
    { pct: (c.passCount / cTotal) * 100, color: "#2f9e78" },
    { pct: (c.flagCount / cTotal) * 100, color: "#c0504d" },
    { pct: (c.unlabeledCount / cTotal) * 100, color: "#d7dce2" },
  ];
  const outcomePct = pct(c.passCount / cTotal);
  const outcomeLegend = [
    { color: "#2f9e78", label: "Clean / pass", detail: String(c.passCount) },
    { color: "#c0504d", label: "Flagged", detail: String(c.flagCount) },
    { color: "#d7dce2", label: "Unlabeled", detail: String(c.unlabeledCount) },
  ];

  // --- Invoice triage mix donut (cleared / review / exception) ---
  const exceptOnly = exceptions.filter((r) => r.status === "over_budget" || r.status === "no_po").length;
  const triageDonut = [
    { pct: total ? (matched / total) * 100 : 0, color: "#2f9e78" },
    { pct: total ? (reviewCount / total) * 100 : 0, color: "#d3a52a" },
    { pct: total ? (exceptOnly / total) * 100 : 0, color: "#c0504d" },
  ];
  const triagePct = pct(total ? matched / total : 0);
  const triageLegend = [
    { color: "#2f9e78", label: "Auto-cleared", detail: String(matched) },
    { color: "#d3a52a", label: "Quick review", detail: String(reviewCount) },
    { color: "#c0504d", label: "Exception", detail: String(exceptOnly) },
  ];

  // --- Exception reasons ---
  const reasonDefs: { key: (r: MatchResult) => boolean; label: string; color: string }[] = [
    { key: (r) => r.status === "no_po", label: "No PO match", color: "#c0504d" },
    { key: (r) => r.status === "over_budget", label: "Over budget", color: "#d3a52a" },
    { key: (r) => r.status === "review" && !r.duplicate?.isDuplicate, label: "Vendor / link review", color: "#2e6da4" },
    { key: (r) => !!r.duplicate?.isDuplicate, label: "Possible duplicate", color: "#8893a2" },
  ];
  const exTotal = exceptions.length || 1;
  const exceptionReasons = reasonDefs
    .map((d) => ({ label: d.label, color: d.color, count: exceptions.filter(d.key).length }))
    .filter((d) => d.count > 0)
    .map((d) => ({ label: d.label, color: d.color, pctLabel: pct(d.count / exTotal), width: `${Math.round((d.count / exTotal) * 100)}%` }));

  // --- Needs-attention buckets ---
  const STATUS_PILL: Record<MatchStatus, { bg: string; fg: string }> = {
    matched: { bg: "#e9f4ef", fg: "#1f7a5a" }, review: { bg: "#fbf4e3", fg: "#9a6b00" }, over_budget: { bg: "#fbecec", fg: "#b23b3b" }, no_po: { bg: "#fbecec", fg: "#b23b3b" },
  };
  const invoiceRows = exceptions.slice(0, 8).map((r) => [
    { text: r.invoice.invoiceNumber, mono: true, color: "#5a6675" },
    { text: r.invoice.vendor, color: "#2a3645", weight: 500 },
    { text: usd(r.invoice.amount), num: true, color: "#2a3645" },
    { text: STATUS_LABEL[r.status], pill: true, pillBg: STATUS_PILL[r.status].bg, pillFg: STATUS_PILL[r.status].fg },
    { text: r.explanation, color: "#7a8493", wrap: true },
  ]);
  const overRows = overPlan.map((r) => [
    { text: r.vendor, color: "#2a3645", weight: 500 },
    { text: usd(r.budget), num: true, color: "#5a6675" },
    { text: usd(r.projected), num: true, color: "#2a3645" },
    { text: signedUsd(r.variance), num: true, color: "#b23b3b", weight: 600 },
  ]);
  const contractRows = records.length
    ? records.slice(0, 8).map((r) => [
        { text: r.vendor ?? "-", color: "#2a3645", weight: 500 },
        { text: r.extraction.counterpartyType ?? "contract", color: "#5a6675" },
        { text: r.extraction.paymentSchedule ?? "schedule n/a", color: "#7a8493" },
        { text: r.extraction.totalValue != null ? usd(r.extraction.totalValue) : "-", num: true, color: "#2a3645" },
      ])
    : [];

  const buckets: Bucket[] = [
    {
      key: "invoices", label: "Invoices needing a human", sub: "the rules could not auto-clear these",
      value: String(exceptions.length), unit: `of ${total}`, valueColor: exceptions.length ? "#b23b3b" : "#1f7a5a",
      chip: exceptions.length ? "action" : "clear", chipBg: exceptions.length ? "#fbecec" : "#e9f4ef", chipFg: exceptions.length ? "#b23b3b" : "#1f7a5a",
      accent: "#1f7a5a", accentBg: "#e7f3ee",
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M8 14h4" /></svg>),
      cols: [{ label: "Invoice", w: "0.9fr", align: "left" }, { label: "Vendor", w: "1.3fr", align: "left" }, { label: "Amount", w: "0.8fr", align: "right" }, { label: "Status", w: "0.8fr", align: "left" }, { label: "Why", w: "2fr", align: "left" }],
      rows: invoiceRows, empty: "Every invoice cleared this run.", footNote: live ? "Resolved by the live engine; a human approves every exception." : "Offline baseline; the live engine resolves more of the tail.",
      href: "/invoice-matching", cta: "Open invoice check",
    },
    {
      key: "contracts", label: "Contracts committed to the shared record", sub: "read once, available downstream to BudgetIQ",
      value: String(records.length), unit: records.length === 1 ? "record" : "records", valueColor: "#16202e",
      chip: records.length ? "linked" : "none yet", chipBg: records.length ? "#eaf1fa" : "#f1f3f5", chipFg: records.length ? "#2e6da4" : "#5a6675",
      accent: "#2e6da4", accentBg: "#eaf1fa",
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></svg>),
      cols: [{ label: "Vendor", w: "1.4fr", align: "left" }, { label: "Type", w: "1fr", align: "left" }, { label: "Schedule", w: "1.4fr", align: "left" }, { label: "Total value", w: "0.9fr", align: "right" }],
      rows: contractRows, empty: "No contracts committed yet. Review one in ContractIQ and commit it.", footNote: "Each committed record flows to invoice matching and the accrual basis.",
      href: "/contract-review", cta: "Open ContractIQ",
    },
    {
      key: "variance", label: "Vendors projected over plan", sub: `net ${signedUsd(netVariance)} vs annual budget`,
      value: String(overPlan.length), unit: `of ${reforecast.length}`, valueColor: overPlan.length ? "#b23b3b" : "#1f7a5a",
      chip: netVariance > 0 ? "over plan" : "under plan", chipBg: netVariance > 0 ? "#fbecec" : "#e9f4ef", chipFg: netVariance > 0 ? "#b23b3b" : "#1f7a5a",
      accent: "#1f7a5a", accentBg: "#e7f3ee",
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5M4 19h16" /><path d="M8 16l4-5 3 3 4-6" /></svg>),
      cols: [{ label: "Vendor", w: "1.8fr", align: "left" }, { label: "Annual budget", w: "1fr", align: "right" }, { label: "Projected EOY", w: "1fr", align: "right" }, { label: "Variance", w: "1fr", align: "right" }],
      rows: overRows, empty: "Every vendor line is within plan.", footNote: "Reforecast over the payment schedule plus any uploaded actuals.",
      href: "/financial-planning", cta: "Open budget planning",
    },
  ];

  return {
    quarterLabel: "Q2 FY26 close in progress", live,
    kpis, ctTotal: ctSum, contractTypes, varianceRows,
    outcomeDonut, outcomePct, outcomeLegend,
    triageDonut, triagePct, triageTotal: total, triageLegend,
    exceptionReasons, buckets,
  };
}

interface Cell { text: string; mono?: boolean; num?: boolean; color?: string; weight?: number; wrap?: boolean; pill?: boolean; pillBg?: string; pillFg?: string }
interface Bucket {
  key: string; label: string; sub: string; value: string; unit: string; valueColor: string;
  chip: string; chipBg: string; chipFg: string; accent: string; accentBg: string; icon: ReactNode;
  cols: { label: string; w: string; align: "left" | "right" }[]; rows: Cell[][]; empty: string; footNote: string; href: string; cta: string;
}

// ---------------------------------------------------------------------------
// Animated lifecycle flow diagram
// ---------------------------------------------------------------------------
const TRACK_Y = 13;
function FlowDiagram() {
  return (
    <div style={{ ...card, marginTop: 26, padding: "24px 26px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ ...sectionEyebrow, color: "#8893a2" }}>One record, four linked stations</div>
        <div style={{ fontSize: 11, color: "#9aa3b0", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2f9e78" }} />record in motion</div>
      </div>
      <div style={{ position: "relative", paddingTop: 6 }}>
        <div style={{ position: "absolute", top: TRACK_Y, left: "12.5%", right: "12.5%", height: 2, background: "#dde3ea", transform: "translateY(-50%)" }} />
        <div className="pq-flow-dot" style={{ position: "absolute", top: TRACK_Y, width: 9, height: 9, borderRadius: "50%", background: "#2f9e78", boxShadow: "0 0 0 4px rgba(47,158,120,.18)", transform: "translate(-50%,-50%)" }} />
        <div style={{ display: "flex" }}>
          {LIFECYCLE.map((st, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 10px" }}>
              <div className="pq-flow-node" style={{ width: 14, height: 14, borderRadius: "50%", background: st.dot, border: "3px solid #fff", outline: `4px solid ${st.ring}`, animationDelay: NODE_DELAYS[i] }} />
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: st.tagColor, marginTop: 18, marginBottom: 6 }}>{st.module}</div>
              <div className="serif" style={{ fontSize: 14.5, fontWeight: 600, color: "#1f2a38", marginBottom: 4 }}>{st.title}</div>
              <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45, maxWidth: 180 }}>{st.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 22, paddingTop: 15, borderTop: "1px dashed #e6e8ec", fontSize: 12, color: "#8893a2", lineHeight: 1.55 }}>
        The shared <span className="mono" style={{ color: "#2e6da4", fontWeight: 500 }}>ContractExtraction</span> record is written once by ContractIQ and read at every later station by BudgetIQ, so AP and finance never re-read the contract by hand.
      </div>
    </div>
  );
}
