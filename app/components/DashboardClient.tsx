"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { INVOICES, PURCHASE_ORDERS, BUDGET_LINES } from "@/lib/mockData";
import { matchAllDeterministic } from "@/lib/matching";
import type { MatchStatus } from "@/lib/types";

// The platform dashboard as a WORKBENCH. The top is a live, at-a-glance read of
// what needs a human across the two modules: contracts queued for the attorney,
// invoices the rules could not auto-clear, and the projected budget variance.
// Each tile expands to its own breakdown and a deep link into the module. The
// quiet business-case framing now lives on the Impact tab. The lifecycle diagram
// sits at the bottom and animates one record moving through the four stations.

// ---------------------------------------------------------------------------
// At-a-glance metrics, computed from the same synthetic data the modules use so
// the dashboard never disagrees with the working surfaces.
// ---------------------------------------------------------------------------

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
function signedUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

// 1. Attorney review queue. The three bundled samples stand in for the contracts
// waiting on a disposition, each with its headline finding(s).
interface QueueItem {
  vendor: string;
  doc: string;
  flags: number;
  issue: string;
}
const REVIEW_QUEUE: QueueItem[] = [
  { vendor: "CryoLogix Cold Chain Solutions", doc: "Master Services Agreement", flags: 1, issue: "Net 15 payment terms, shorter than the Net 60 standard." },
  { vendor: "Helix Analytics", doc: "Software license and subscription", flags: 2, issue: "Unlimited liability, and no Data Processing Agreement on a PII vendor." },
  { vendor: "Sentinel Managed Services", doc: "Change Order No. 3", flags: 2, issue: "Backdated effective date, and a missing order-of-precedence clause." },
];
const QUEUE_FLAGS = REVIEW_QUEUE.reduce((a, q) => a + q.flags, 0);

// 2. Invoice exceptions. The deterministic engine clears the clean matches; what
// is left needs a human. This is the offline baseline, the honest count before
// any AI lift.
const MATCH_RESULTS = matchAllDeterministic(INVOICES, PURCHASE_ORDERS);
const EXCEPTIONS = MATCH_RESULTS.filter((r) => r.needsHuman);
const STATUS_LABEL: Record<MatchStatus, string> = {
  matched: "matched",
  review: "review",
  over_budget: "over budget",
  no_po: "no PO",
};
const STATUS_REASON: Record<MatchStatus, string> = {
  matched: "Cleared within budget.",
  review: "Medium-confidence link, needs a confirm.",
  over_budget: "Exceeds the remaining PO budget.",
  no_po: "No open PO match for this vendor.",
};

// 3. Budget variance. Same reforecast math as financial-planning, with no
// uploaded actuals: projected end-of-year vs the annual budget per vendor line.
const CURRENT_MONTH = 5; // June, 0-indexed
function ytd(actuals: number[]): number {
  return actuals.reduce((a, b) => a + b, 0);
}
const REFORECAST = BUDGET_LINES.map((l) => {
  const projected = ytd(l.actualsToDate) + l.monthlyExpected.slice(CURRENT_MONTH).reduce((a, b) => a + b, 0);
  return { vendor: l.vendor, budget: l.annualBudget, projected, variance: projected - l.annualBudget };
});
const NET_VARIANCE = REFORECAST.reduce((a, r) => a + r.variance, 0);
const OVER_PLAN = REFORECAST.filter((r) => r.variance > 0).length;

// ---------------------------------------------------------------------------
// Lifecycle stations (the bottom diagram).
// ---------------------------------------------------------------------------
interface Station {
  module: string;
  title: string;
  sub: string;
  tagColor: string;
  dot: string;
  ring: string;
}
const LIFECYCLE: Station[] = [
  { module: "ContractIQ", title: "Contract extracted", sub: "Read once at signing against the playbook.", tagColor: "#2e6da4", dot: "#2e6da4", ring: "#e1ebf6" },
  { module: "Procurement", title: "PO / work order", sub: "A purchase order is raised.", tagColor: "#5a7290", dot: "#5a7290", ring: "#e8ecf2" },
  { module: "BudgetIQ", title: "Invoice matched", sub: "AP matches the invoice to the PO.", tagColor: "#1f7a5a", dot: "#2f9e78", ring: "#dcefe7" },
  { module: "BudgetIQ", title: "Accrual drafted", sub: "Finance accrues from the schedule.", tagColor: "#1f7a5a", dot: "#2f9e78", ring: "#dcefe7" },
];
// Delays line up each station pulse with the traveling dot's arrival in pq-flow.
const NODE_DELAYS = ["0.2s", "1.95s", "3.9s", "6.3s"];

// ---------------------------------------------------------------------------
// Quick-launch module cards.
// ---------------------------------------------------------------------------
interface ModuleCard {
  href: string;
  tag: string;
  title: string;
  desc: string;
  tagColor: string;
  iconBg: string;
  iconFg: string;
  icon: ReactNode;
}
const MODULE_CARDS: ModuleCard[] = [
  {
    href: "/contract-review",
    tag: "ContractIQ",
    title: "Contract review",
    desc: "First-pass review against the standard-terms playbook.",
    tagColor: "#2e6da4",
    iconBg: "#eaf1fa",
    iconFg: "#2e6da4",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    href: "/invoice-matching",
    tag: "BudgetIQ",
    title: "Invoice check",
    desc: "Match invoices to POs and route exceptions to a human.",
    tagColor: "#1f7a5a",
    iconBg: "#e7f3ee",
    iconFg: "#1f7a5a",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 9h18M8 14h4" />
      </svg>
    ),
  },
  {
    href: "/financial-planning",
    tag: "BudgetIQ",
    title: "Budget planning",
    desc: "Draft quarter-close accruals and the reforecast.",
    tagColor: "#1f7a5a",
    iconBg: "#e7f3ee",
    iconFg: "#1f7a5a",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19V5M4 19h16" />
        <path d="M8 16l4-5 3 3 4-6" />
      </svg>
    ),
  },
  {
    href: "/knowledge",
    tag: "Knowledge",
    title: "Precedent corpus",
    desc: "Curate precedent, index it, and check retrieval accuracy.",
    tagColor: "#5a7290",
    iconBg: "#eef1f6",
    iconFg: "#5a7290",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z" />
        <path d="M4 17h14" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
type MetricKey = "contracts" | "invoices" | "variance";

interface Metric {
  key: MetricKey;
  tag: string;
  tagColor: string;
  label: string;
  value: string;
  valueColor: string;
  sub: string;
  href: string;
  cta: string;
}
const METRICS: Metric[] = [
  {
    key: "contracts",
    tag: "ContractIQ",
    tagColor: "#2e6da4",
    label: "Contracts in attorney queue",
    value: String(REVIEW_QUEUE.length),
    valueColor: "#16202e",
    sub: `${QUEUE_FLAGS} open findings awaiting a disposition`,
    href: "/contract-review",
    cta: "Open ContractIQ",
  },
  {
    key: "invoices",
    tag: "BudgetIQ",
    tagColor: "#1f7a5a",
    label: "Invoices to review",
    value: String(EXCEPTIONS.length),
    valueColor: EXCEPTIONS.length > 0 ? "#b23b3b" : "#1f7a5a",
    sub: `of ${INVOICES.length} received this cycle could not auto-clear`,
    href: "/invoice-matching",
    cta: "Open invoice check",
  },
  {
    key: "variance",
    tag: "BudgetIQ",
    tagColor: "#1f7a5a",
    label: "Projected budget variance",
    value: signedUsd(NET_VARIANCE),
    valueColor: NET_VARIANCE > 0 ? "#b23b3b" : "#1f7a5a",
    sub: `${NET_VARIANCE > 0 ? "over" : "under"} plan, ${OVER_PLAN} of ${REFORECAST.length} vendor lines over budget`,
    href: "/financial-planning",
    cta: "Open budget planning",
  },
];

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10 };
const thCell: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };

export default function DashboardClient() {
  const [open, setOpen] = useState<MetricKey | null>("invoices");

  return (
    <div className="pq-route">
      {/* Header, tightened. The platform overview moved to Impact. */}
      <div style={{ maxWidth: 760 }}>
        <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 600, letterSpacing: "-.4px", margin: "0 0 8px", color: "#16202e" }}>
          Overview
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#6a7484", margin: 0 }}>
          What needs a human across ContractIQ and BudgetIQ right now. Open a tile for the breakdown.
        </p>
      </div>

      {/* At-a-glance metric tiles */}
      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {METRICS.map((m) => {
          const active = open === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setOpen((cur) => (cur === m.key ? null : m.key))}
              className="pq-card-hover"
              style={{
                ...card,
                textAlign: "left",
                padding: "18px 20px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                borderColor: active ? "#cdd3db" : "#e6e8ec",
                boxShadow: active ? "0 4px 14px rgba(20,30,45,.06)" : "none",
                borderTop: `2px solid ${m.tagColor}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: m.tagColor }}>{m.tag}</span>
                <span style={{ fontSize: 11, color: active ? "#5a6675" : "#aab2bd", transform: active ? "rotate(180deg)" : "none", transition: "transform .15s" }}>&#9662;</span>
              </div>
              <div className="serif num" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.5px", lineHeight: 1, color: m.valueColor, marginBottom: 8 }}>
                {m.value}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2a3645", marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45 }}>{m.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Expanded breakdown for the open tile */}
      {open && (
        <div style={{ ...card, marginTop: 14, overflow: "hidden" }}>
          {open === "contracts" && <ContractsDetail />}
          {open === "invoices" && <InvoicesDetail />}
          {open === "variance" && <VarianceDetail />}
        </div>
      )}

      {/* Quick-launch module cards */}
      <div style={{ marginTop: 26, fontSize: 11.5, fontWeight: 600, color: "#8893a2", textTransform: "uppercase", letterSpacing: ".7px" }}>
        Jump into a module
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {MODULE_CARDS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="pq-card-hover"
            style={{ ...card, padding: "18px 18px", cursor: "pointer", display: "flex", flexDirection: "column", minHeight: 164 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 8, background: m.iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, color: m.iconFg }}>
              {m.icon}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: m.tagColor, marginBottom: 5 }}>{m.tag}</div>
            <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38", marginBottom: 6 }}>{m.title}</div>
            <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5, flex: 1 }}>{m.desc}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginTop: 12, display: "flex", alignItems: "center", gap: 5 }}>
              Open<span style={{ fontSize: 13 }}>&rarr;</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Impact link, kept quiet */}
      <Link
        href="/impact"
        className="pq-card-hover"
        style={{ ...card, marginTop: 22, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "#f1f3f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#5a6675" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 19V5M4 19h16" />
              <path d="M8 15l3-4 3 2 4-6" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2a38" }}>Business case and ROI</div>
            <div style={{ fontSize: 12, color: "#8893a2" }}>Hours recovered and throughput, with the platform overview, kept off the working surfaces.</div>
          </div>
        </div>
        <span style={{ color: "#aab2bd", fontSize: 18 }}>&rarr;</span>
      </Link>

      {/* Lifecycle flow diagram, animated, at the bottom */}
      <FlowDiagram />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panels
// ---------------------------------------------------------------------------
function DetailHeader({ title, sub, href, cta }: { title: string; sub: string; href: string; cta: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, padding: "16px 20px", borderBottom: "1px solid #eef0f3", background: "#fafbfc" }}>
      <div>
        <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#8893a2", marginTop: 2 }}>{sub}</div>
      </div>
      <Link href={href} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--navy,#1f3a5f)", padding: "8px 13px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
        {cta}<span>&rarr;</span>
      </Link>
    </div>
  );
}

function ContractsDetail() {
  return (
    <>
      <DetailHeader
        title="Contracts in the attorney queue"
        sub={`${REVIEW_QUEUE.length} contracts, ${QUEUE_FLAGS} open findings`}
        href="/contract-review"
        cta="Open ContractIQ"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr .6fr 2.4fr", columnGap: 20, padding: "10px 20px", borderBottom: "1px solid #eef0f3", ...thCell }}>
        <div>Vendor</div>
        <div>Document</div>
        <div style={{ textAlign: "center" }}>Flags</div>
        <div>Headline issue</div>
      </div>
      {REVIEW_QUEUE.map((q) => (
        <div key={q.vendor} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr .6fr 2.4fr", columnGap: 20, padding: "12px 20px", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
          <div style={{ color: "#2a3645", fontWeight: 500 }}>{q.vendor}</div>
          <div style={{ color: "#5a6675" }}>{q.doc}</div>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "#fbecec", color: "#b23b3b" }}>{q.flags}</span>
          </div>
          <div style={{ color: "#7a8493", lineHeight: 1.45 }}>{q.issue}</div>
        </div>
      ))}
    </>
  );
}

function InvoicesDetail() {
  return (
    <>
      <DetailHeader
        title="Invoices the rules could not auto-clear"
        sub={`${EXCEPTIONS.length} of ${INVOICES.length} need a human, offline baseline`}
        href="/invoice-matching"
        cta="Open invoice check"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr .8fr .9fr 1.9fr", columnGap: 18, padding: "10px 20px", borderBottom: "1px solid #eef0f3", ...thCell }}>
        <div>Invoice</div>
        <div>Vendor</div>
        <div style={{ textAlign: "right" }}>Amount</div>
        <div style={{ textAlign: "center" }}>Status</div>
        <div>Why</div>
      </div>
      {EXCEPTIONS.map((r) => {
        const over = r.status === "over_budget" || r.status === "no_po";
        return (
          <div key={r.invoice.invoiceNumber} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr .8fr .9fr 1.9fr", columnGap: 18, padding: "12px 20px", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
            <div className="mono" style={{ color: "#5a6675", fontSize: 11.5 }}>{r.invoice.invoiceNumber}</div>
            <div style={{ color: "#2a3645", fontWeight: 500 }}>{r.invoice.vendor}</div>
            <div className="num" style={{ textAlign: "right", color: "#2a3645" }}>{usd(r.invoice.amount)}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap", background: over ? "#fbecec" : "#fbf4e3", color: over ? "#b23b3b" : "#9a6b00" }}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <div style={{ color: "#7a8493", lineHeight: 1.45 }}>{STATUS_REASON[r.status]}</div>
          </div>
        );
      })}
    </>
  );
}

function VarianceDetail() {
  return (
    <>
      <DetailHeader
        title="Reforecast vs annual budget"
        sub={`Net ${signedUsd(NET_VARIANCE)} projected ${NET_VARIANCE > 0 ? "over" : "under"} plan`}
        href="/financial-planning"
        cta="Open budget planning"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", columnGap: 24, padding: "10px 20px", borderBottom: "1px solid #eef0f3", ...thCell }}>
        <div>Vendor</div>
        <div style={{ textAlign: "right" }}>Annual budget</div>
        <div style={{ textAlign: "right" }}>Projected EOY</div>
        <div style={{ textAlign: "right" }}>Variance</div>
      </div>
      {REFORECAST.map((r) => (
        <div key={r.vendor} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", columnGap: 24, padding: "12px 20px", borderBottom: "1px solid #f1f3f5", alignItems: "center", fontSize: 12.5 }}>
          <div style={{ color: "#2a3645", fontWeight: 500 }}>{r.vendor}</div>
          <div className="num" style={{ textAlign: "right", color: "#5a6675" }}>{usd(r.budget)}</div>
          <div className="num" style={{ textAlign: "right", color: "#2a3645" }}>{usd(r.projected)}</div>
          <div className="num" style={{ textAlign: "right", fontWeight: 600, color: r.variance > 0 ? "#b23b3b" : "#1f7a5a" }}>{signedUsd(r.variance)}</div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Animated lifecycle flow diagram
// ---------------------------------------------------------------------------
const TRACK_Y = 13; // vertical center of the connector line and station dots

function FlowDiagram() {
  return (
    <div style={{ ...card, marginTop: 26, padding: "24px 26px 26px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8893a2", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 26 }}>
        One record, four stations
      </div>

      <div style={{ position: "relative", paddingTop: 6 }}>
        {/* Connector line, spanning the first to the last station dot */}
        <div style={{ position: "absolute", top: TRACK_Y, left: "12.5%", right: "12.5%", height: 2, background: "#dde3ea", transform: "translateY(-50%)" }} />

        {/* The traveling record, a dot that dwells at each station then continues */}
        <div
          className="pq-flow-dot"
          style={{ position: "absolute", top: TRACK_Y, width: 9, height: 9, borderRadius: "50%", background: "#2f9e78", boxShadow: "0 0 0 4px rgba(47,158,120,.18)", transform: "translate(-50%,-50%)" }}
        />

        {/* Stations */}
        <div style={{ display: "flex" }}>
          {LIFECYCLE.map((st, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 10px" }}>
              <div
                className="pq-flow-node"
                style={{ width: 14, height: 14, borderRadius: "50%", background: st.dot, border: `3px solid #fff`, outline: `4px solid ${st.ring}`, animationDelay: NODE_DELAYS[i] }}
              />
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: st.tagColor, marginTop: 18, marginBottom: 6 }}>{st.module}</div>
              <div className="serif" style={{ fontSize: 14.5, fontWeight: 600, color: "#1f2a38", marginBottom: 4 }}>{st.title}</div>
              <div style={{ fontSize: 11.5, color: "#7a8493", lineHeight: 1.45, maxWidth: 180 }}>{st.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22, paddingTop: 15, borderTop: "1px dashed #e6e8ec", fontSize: 12, color: "#8893a2", lineHeight: 1.55 }}>
        The shared <span className="mono" style={{ color: "#2e6da4", fontWeight: 500 }}>ContractExtraction</span> record is written once by
        ContractIQ and read at every later station by BudgetIQ, so AP and finance never re-read the contract by hand.
      </div>
    </div>
  );
}
