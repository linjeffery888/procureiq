"use client";

import { useState } from "react";
import {
  contractAssumptions,
  invoiceAssumptions,
  financeAssumptions,
  Assumption,
} from "@/lib/costModel";

// The Impact screen: the one place dollars live, rebuilt as the build-justification
// surface for the IT lead and the CFO. It answers three questions in order: where
// the throughput comes from, what it is worth, and what it costs to build. The
// working module surfaces stay clean tools and speak only in hours, queues, and
// findings; the money case is quarantined here. Every figure is tagged VERIFIED
// from discovery, an ASSUMPTION, or an ESTIMATE, and the opportunity value scales
// with one input (addressable IT spend) the CFO sets live.

// ---------------------------------------------------------------------------
// Tokens (within the ProcureIQ system, pushed toward an instrument readout)
// ---------------------------------------------------------------------------
const NAVY = "#16293f";
const INK = "#16202e";
const GREEN = "#1f7a5a";
const READOUT = "#4ecb8d"; // luminous green for figures on the navy field
const SLATE = "#5a7290";
const LINE = "#e6e8ec";

const SOURCE_STYLE: Record<Assumption["source"], { bg: string; fg: string }> = {
  verified: { bg: "#e9f4ef", fg: "#1f7a5a" },
  assumption: { bg: "#fbf4e3", fg: "#9a6b00" },
  estimate: { bg: "#eef1f6", fg: "#5a7290" },
};

function Tag({ source }: { source: Assumption["source"] }) {
  const t = SOURCE_STYLE[source];
  return (
    <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: t.bg, color: t.fg, textTransform: "uppercase", letterSpacing: ".3px", whiteSpace: "nowrap" }}>
      {source}
    </span>
  );
}

// Compact money: $65K, $262K, $986K, $2K, $1.97M
function comp(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1000)}K`;
  return `$${v}`;
}

function fmtValue(a: Assumption): string {
  if (a.unit === "fraction") return `${Math.round(a.value * 100)}%`;
  return `${a.value.toLocaleString()} ${a.unit}`;
}

// ---------------------------------------------------------------------------
// Content: the throughput story (grounded in the workflow analyses)
// ---------------------------------------------------------------------------
const THROUGHPUT = [
  {
    label: "Contract review",
    metric: "10-12×",
    sub: "first-pass throughput",
    proof: "The attorney opens 1 in 4 contracts, at a quarter of the time.",
    mech: "Clean SaaS renewals auto-clear and never reach a lawyer.",
  },
  {
    label: "Invoice matching",
    metric: "8-10×",
    sub: "processing throughput",
    proof: "AP and approvers touch 1 in 7 invoices, pre-diagnosed.",
    mech: "Rules clear the 85% that is clean before anyone hunts a PO.",
  },
  {
    label: "Quarter-close",
    metric: "days → hrs",
    sub: "accrual cycle",
    proof: "Predictable vendors accrue straight off the contract schedule.",
    mech: "About 60% of the close labor is removed; only usage-based vendors need outreach.",
  },
];

// Fixed value tiers (Tier 1 and Tier 2). Opportunity (Tier 3) is computed from spend.
const FIXED_TIERS: { label: string; note: string; value: number; source: Assumption["source"] }[] = [
  { label: "Hard labor recovered", note: "Invoice and accrual hours at your loaded rates", value: 65_000, source: "verified" },
  { label: "Attorney backfill avoided", note: "Two attorneys to one; the throughput covers the gap", value: 262_500, source: "verified" },
  { label: "Paralegal capacity redeployed", note: "First-pass prep automated, about one FTE", value: 200_000, source: "assumption" },
];

const BUILD = 250_000;
const RUN = 130_000;
const AI_INFERENCE = 2_000;

// Opportunity levers as a function of addressable IT third-party spend S.
function leversFor(S: number) {
  return [
    { label: "Duplicate-payment recovery", formula: "0.10% of spend", value: 0.001 * S },
    { label: "Overbilling caught", formula: "0.25% of spend", value: 0.0025 * S },
    { label: "Working-capital carry", formula: "Net 30 to 60 on 30% of spend, at 8%", value: 0.001973 * S },
    { label: "Early-pay and late-fee", formula: "0.10% of spend", value: 0.001 * S },
    { label: "Risk-adjusted term avoidance", formula: "Expected value, low-probability", value: 75_000 },
  ];
}
const SPEND_OPTIONS = [20_000_000, 40_000_000, 80_000_000];

// ---------------------------------------------------------------------------
function Ledger({ title, sub, rows }: { title: string; sub: string; rows: Assumption[] }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 20 }}>
      <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#8893a2", marginBottom: 15 }}>{sub}</div>
      <div style={{ border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr .9fr 2.2fr", padding: "9px 14px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px" }}>
          <div>Assumption</div>
          <div style={{ textAlign: "right" }}>Value</div>
          <div style={{ textAlign: "center" }}>Source</div>
          <div>Note</div>
        </div>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "2fr 1fr .9fr 2.2fr", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", alignItems: "center", fontSize: 12 }}>
            <div style={{ color: "#2a3645" }}>{row.label}</div>
            <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 500 }}>{fmtValue(row)}</div>
            <div style={{ textAlign: "center" }}><Tag source={row.source} /></div>
            <div style={{ color: "#8893a2", fontSize: 11.5 }}>{row.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImpactPage() {
  const [presenter, setPresenter] = useState(false);
  const [spend, setSpend] = useState(40_000_000);
  const showDetail = !presenter;

  const levers = leversFor(spend);
  const opportunity = levers.reduce((a, l) => a + l.value, 0);
  const wcOneTime = 0.02466 * spend;

  const grossHard = 65_000 + 262_500 + opportunity; // excludes redeployable capacity
  const grossWithCapacity = grossHard + 200_000;
  const netRecurring = grossWithCapacity - RUN;
  const roiHard = grossHard / RUN;
  const paybackMonths = BUILD / (grossHard / 12);

  const tierMax = Math.max(262_500, opportunity);
  const tiers = [...FIXED_TIERS, { label: "Opportunity value", note: "Leakage recovered and working capital, scales with spend", value: opportunity, source: "estimate" as const }];

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>Impact</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 12px", color: INK }}>The business case</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.62, color: "#5a6675", margin: 0 }}>
            Where the throughput comes from, what it is worth, and what it costs to build. Dollars live on this screen
            only; the working tools speak in hours, queues, and findings. Every figure is tagged for how it is grounded,
            and the opportunity value scales with the one number Finance sets: addressable IT spend.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPresenter((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px", border: `1px solid ${presenter ? GREEN : "#d8dde4"}`, borderRadius: 8, background: "#fff" }}
        >
          <span style={{ width: 32, height: 19, borderRadius: 10, background: presenter ? GREEN : "#cdd3db", position: "relative", flexShrink: 0, transition: "background .15s" }}>
            <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: presenter ? 15 : 2, transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#3a4655" }}>Presenter mode</span>
        </button>
      </div>

      {/* SIGNATURE: throughput readout panel on a measurement grid */}
      <section
        aria-label="Throughput gains"
        style={{
          background: NAVY,
          borderRadius: 14,
          padding: "26px 28px 24px",
          marginBottom: 18,
          color: "#fff",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: "#9fb2cc", textTransform: "uppercase", letterSpacing: ".7px" }}>Throughput, before vs now</div>
          <div className="mono" style={{ fontSize: 11, color: "#7e93af" }}>read once / clear the routine / handle exceptions</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          {THROUGHPUT.map((t, i) => (
            <div key={t.label} style={{ padding: "0 22px", borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,.1)" }}>
              <div className="mono" style={{ fontSize: 10.5, color: "#9fb2cc", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12 }}>{t.label}</div>
              <div className="num" style={{ fontSize: 42, fontWeight: 600, color: READOUT, letterSpacing: "-1px", lineHeight: 1 }}>{t.metric}</div>
              <div style={{ fontSize: 11.5, color: "#7e93af", marginTop: 6, marginBottom: 14 }}>{t.sub}</div>
              <div style={{ fontSize: 12, color: "#d6e2f0", lineHeight: 1.5, marginBottom: 8 }}>{t.proof}</div>
              <div style={{ fontSize: 11.5, color: "#8ea4c0", lineHeight: 1.5 }}>{t.mech}</div>
            </div>
          ))}
        </div>

        {/* Queue-drain bar */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "#9fb2cc", textTransform: "uppercase", letterSpacing: ".5px", minWidth: 110 }}>Attorney queue</span>
            <span style={{ flex: 4, height: 16, borderRadius: 3, background: "rgba(255,255,255,.10)", backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 7px)" }} />
            <span className="num" style={{ fontSize: 12, color: "#9fb2cc" }}>300 backlog</span>
            <span style={{ color: "#7e93af", fontSize: 15 }}>&rarr;</span>
            <span style={{ flex: 1, height: 16, borderRadius: 3, background: "rgba(78,203,141,.28)", backgroundImage: "repeating-linear-gradient(90deg, rgba(78,203,141,.7) 0 1px, transparent 1px 7px)" }} />
            <span className="num" style={{ fontSize: 12, color: READOUT }}>~0, only exceptions</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#8ea4c0", marginTop: 12 }}>
            About three quarters of the queue never reaches a person. The backlog flips from growing to draining; a month becomes same-day for the routine majority.
          </div>
        </div>
      </section>

      {/* WHAT IT IS WORTH: value tiers */}
      <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "22px 24px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#2e6da4", marginBottom: 5 }}>What it is worth</div>
            <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: INK }}>Annual value, built from the bottom up</div>
          </div>
          {/* Spend selector: the one input Finance sets */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: SLATE }}>Addressable IT spend</span>
            <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" }}>
              {SPEND_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpend(s)}
                  className="num"
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", border: "none", background: spend === s ? NAVY : "#fff", color: spend === s ? "#fff" : "#5a6675" }}
                >
                  ${s / 1_000_000}M
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tier bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {tiers.map((tier) => (
            <div key={tier.label} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) 3fr auto", alignItems: "center", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: "#2a3645", fontWeight: 500 }}>{tier.label}</div>
                <div style={{ fontSize: 11, color: "#9aa3b0" }}>{tier.note}</div>
              </div>
              <div style={{ background: "#f1f3f6", borderRadius: 4, height: 22, position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(6, (tier.value / tierMax) * 100)}%`, height: "100%", borderRadius: 4, background: tier.source === "verified" ? GREEN : tier.source === "assumption" ? "#cf9b2e" : "#8ea0b8", transition: "width .3s ease" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", minWidth: 150 }}>
                <span className="num" style={{ fontSize: 15, fontWeight: 600, color: INK }}>{comp(tier.value)}</span>
                <Tag source={tier.source} />
              </div>
            </div>
          ))}
        </div>

        {/* Net line */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${LINE}`, flexWrap: "wrap", gap: 14 }}>
          <div style={{ fontSize: 12, color: SLATE, maxWidth: 360, lineHeight: 1.5 }}>
            Gross recurring less the {comp(RUN)} a year to run it. A one-time {comp(wcOneTime)} of working capital is released on top.
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: SLATE, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 3 }}>Net recurring value</div>
            <div className="serif num" style={{ fontSize: 38, fontWeight: 600, color: GREEN, letterSpacing: "-1px", lineHeight: 1 }}>{comp(netRecurring)}<span style={{ fontSize: 16, color: "#9aa3b0", fontWeight: 500 }}> / yr</span></div>
          </div>
        </div>
      </section>

      {/* THE INVESTMENT CASE: cost vs return */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16, marginBottom: 18 }}>
        {/* Cost */}
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#2e6da4", marginBottom: 14 }}>What it costs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "#2a3645" }}>Build, one-time</span>
              <span className="num" style={{ fontSize: 16, fontWeight: 600, color: INK }}>{comp(BUILD)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "#2a3645" }}>Run, per year</span>
              <span className="num" style={{ fontSize: 16, fontWeight: 600, color: INK }}>{comp(RUN)}</span>
            </div>
            {/* The punchline */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#e9f4ef", border: "1px solid #cdebde", borderRadius: 8 }}>
              <span style={{ fontSize: 12.5, color: GREEN, fontWeight: 600 }}>Of which the AI itself</span>
              <span className="num" style={{ fontSize: 16, fontWeight: 700, color: GREEN }}>{comp(AI_INFERENCE)} / yr</span>
            </div>
            <div style={{ fontSize: 11, color: "#9aa3b0", lineHeight: 1.5 }}>
              Inference is roughly 8,600 calls a year at about $0.15 each. The cost is the people and the integration, not the model.
            </div>
          </div>
        </div>

        {/* Return */}
        <div style={{ background: NAVY, borderRadius: 12, padding: "20px 24px", color: "#fff" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#9fb2cc", marginBottom: 16 }}>What it returns</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 24px" }}>
            <div>
              <div className="num" style={{ fontSize: 32, fontWeight: 600, color: READOUT, lineHeight: 1 }}>{paybackMonths.toFixed(1)}<span style={{ fontSize: 14, color: "#9fb2cc", fontWeight: 500 }}> mo</span></div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginTop: 5 }}>payback on the build</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 32, fontWeight: 600, color: READOUT, lineHeight: 1 }}>{roiHard.toFixed(1)}<span style={{ fontSize: 14, color: "#9fb2cc", fontWeight: 500 }}>&#215;</span></div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginTop: 5 }}>ongoing return, conservative</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 22, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{comp(netRecurring)}</div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginTop: 5 }}>net recurring per year</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 22, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{comp(wcOneTime)}</div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginTop: 5 }}>working capital released, one-time</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#8ea4c0", marginTop: 16, lineHeight: 1.5 }}>
            Return shown excludes redeployable paralegal capacity, so it is the floor. With it, the return is closer to {(grossWithCapacity / RUN).toFixed(1)} times.
          </div>
        </div>
      </section>

      {/* Opportunity levers (detail) */}
      {showDetail && (
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "20px 22px", marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#2e6da4", marginBottom: 4 }}>Opportunity value, modeled</div>
          <div style={{ fontSize: 12, color: "#8893a2", marginBottom: 15 }}>
            Benchmark rates against your spend, recomputed at ${spend / 1_000_000}M. These are the cash effects of throughput beyond labor: leakage recovered and working capital freed.
          </div>
          <div style={{ border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.8fr 1fr", padding: "9px 14px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px" }}>
              <div>Lever</div>
              <div>How it is modeled</div>
              <div style={{ textAlign: "right" }}>Per year</div>
            </div>
            {levers.map((l) => (
              <div key={l.label} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.8fr 1fr", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", alignItems: "center", fontSize: 12 }}>
                <div style={{ color: "#2a3645" }}>{l.label}</div>
                <div style={{ color: "#8893a2", fontSize: 11.5 }}>{l.formula}</div>
                <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 500 }}>{comp(l.value)}</div>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.8fr 1fr", padding: "11px 14px", background: "#fafbfc", alignItems: "center", fontSize: 12 }}>
              <div style={{ color: INK, fontWeight: 600 }}>Recurring opportunity value</div>
              <div style={{ color: "#9aa3b0", fontSize: 11 }}>plus a one-time {comp(wcOneTime)} working-capital release</div>
              <div className="num" style={{ textAlign: "right", color: GREEN, fontWeight: 700 }}>{comp(opportunity)}</div>
            </div>
          </div>
        </section>
      )}

      {/* Auditable assumption ledgers (detail) */}
      {showDetail && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Ledger title="ContractIQ, contract review" sub="Attorney and paralegal first-pass hours, cycle compression at signing" rows={contractAssumptions} />
            <Ledger title="BudgetIQ, invoice matching" sub="AP, approver, and rework hours across IT invoice volume" rows={invoiceAssumptions} />
            <Ledger title="BudgetIQ, financial planning" sub="Reforecast and accrual hours across the function leads" rows={financeAssumptions} />
          </div>

          <div style={{ marginTop: 18, fontSize: 11, color: "#9aa3b0", lineHeight: 1.6, maxWidth: 920 }}>
            Figures are synthetic, modeled from discovery, not real Iovance financials. Loaded labor rates and the spend base
            are the given inputs; everything else is tagged verified, assumption, or estimate. Hard labor and the avoided
            attorney hire are grounded in the discovery calls; the opportunity value is benchmark-modeled against a spend base
            Finance sets. Dollars appear on this screen only; the working surfaces speak in hours, queues, findings, and
            throughput. Production stays modular against each team&rsquo;s system of record.
          </div>
        </>
      )}
    </div>
  );
}
