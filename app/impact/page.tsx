"use client";

import { useState } from "react";
import {
  platformTotals,
  contractAssumptions,
  invoiceAssumptions,
  financeAssumptions,
  fmtUSD,
  Assumption,
} from "@/lib/costModel";

// The Impact screen, ported to the approved comp: the one place dollars live.
// The module surfaces stay clean internal tools; the business case is
// quarantined here so a working demo never gets confused with a sales pitch.
// Every number is either VERIFIED from discovery or a STATED ASSUMPTION /
// ESTIMATE, each carrying its source tag so the present-back shows exactly what
// is grounded vs modeled. Presenter mode collapses the detail to the headline
// numbers for the room; the default view shows the full ledger so the math is
// auditable. No new cost model here: it all comes from lib/costModel.

const totals = platformTotals();

const SOURCE_STYLE: Record<Assumption["source"], { bg: string; fg: string }> = {
  verified: { bg: "#e9f4ef", fg: "#1f7a5a" },
  assumption: { bg: "#fbf4e3", fg: "#9a6b00" },
  estimate: { bg: "#eef1f6", fg: "#5a7290" },
};

function fmtValue(a: Assumption): string {
  if (a.unit === "fraction") return `${Math.round(a.value * 100)}%`;
  return `${a.value.toLocaleString()} ${a.unit}`;
}

function Ledger({ title, sub, rows }: { title: string; sub: string; rows: Assumption[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: 20 }}>
      <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "#1f2a38", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#8893a2", marginBottom: 15 }}>{sub}</div>
      <div style={{ border: "1px solid #eef0f3", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr .9fr 2.2fr", padding: "9px 14px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px" }}>
          <div>Assumption</div>
          <div style={{ textAlign: "right" }}>Value</div>
          <div style={{ textAlign: "center" }}>Source</div>
          <div>Note</div>
        </div>
        {rows.map((row) => {
          const tag = SOURCE_STYLE[row.source];
          return (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "2fr 1fr .9fr 2.2fr", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", alignItems: "center", fontSize: 12 }}>
              <div style={{ color: "#2a3645" }}>{row.label}</div>
              <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 500 }}>{fmtValue(row)}</div>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: tag.bg, color: tag.fg, textTransform: "uppercase", letterSpacing: ".3px" }}>{row.source}</span>
              </div>
              <div style={{ color: "#8893a2", fontSize: 11.5 }}>{row.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ImpactPage() {
  const [presenter, setPresenter] = useState(false);
  const showDetail = !presenter;

  const { contract, invoice, finance } = totals;
  const totalHours =
    contract.attorneyHoursSaved +
    contract.paralegalHoursSaved +
    invoice.apHoursSaved +
    invoice.approverHoursSaved +
    invoice.reworkHoursSaved +
    finance.annualHoursSaved;

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, gap: 20 }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#2e6da4", marginBottom: 6 }}>Impact</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 12px", color: "#16202e" }}>Business case</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.62, color: "#5a6675", margin: 0 }}>
            ProcureIQ carries a single vendor contract record across its life: legal first-pass review at signing,
            invoice-to-PO matching in accounts payable, and quarter-close accrual and reforecast in finance. The record is
            read once at signing and reused at every later station, so AP and finance never re-read the contract by hand.
            Each module integrates with its own team&rsquo;s system of record; the deployment stays modular.
          </p>
        </div>
        <div onClick={() => setPresenter((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "8px 14px", border: "1px solid #d8dde4", borderRadius: 8, background: "#fff" }}>
          <div style={{ width: 32, height: 19, borderRadius: 10, background: presenter ? "var(--accent,#1f7a5a)" : "#cdd3db", position: "relative", flexShrink: 0, transition: "background .15s" }}>
            <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: presenter ? 15 : 2, transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#3a4655" }}>Presenter mode</span>
        </div>
      </div>

      {/* Headline band */}
      <div style={{ background: "var(--navy,#1f3a5f)", borderRadius: 12, padding: "30px 32px", marginBottom: 18, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "#9fb2cc", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>Estimated annual labor recovered</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div className="serif num" style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-1px", lineHeight: 1 }}>{fmtUSD(totals.totalAnnualSavings)}</div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "rgba(255,255,255,.14)", color: "#cfe0ef", textTransform: "uppercase", letterSpacing: ".4px" }}>estimate</span>
            </div>
            <div style={{ fontSize: 12.5, color: "#9fb2cc", marginTop: 9 }}>
              Roughly {totalHours.toLocaleString()} labor-hours per year, counted only where they convert to throughput.
            </div>
          </div>
          <div style={{ display: "flex", gap: 30 }}>
            <div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginBottom: 5 }}>ContractIQ</div>
              <div className="num" style={{ fontSize: 24, fontWeight: 600 }}>{fmtUSD(totals.contractIqSavings)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9fb2cc", marginBottom: 5 }}>BudgetIQ</div>
              <div className="num" style={{ fontSize: 24, fontWeight: 600 }}>{fmtUSD(totals.budgetIqSavings)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Framing band */}
      {showDetail && (
        <div style={{ background: "#f4f6f9", border: "1px solid #e2e7ee", borderRadius: 10, padding: "16px 20px", marginBottom: 18, fontSize: 12.5, color: "#5a6675", lineHeight: 1.6 }}>
          These are labor-hours recovered, not headcount cuts. The win is throughput: the same team clears more and closes
          the quarter faster. The data unifies; the deployment stays modular against each team&rsquo;s system of record.
        </div>
      )}

      {/* Module split cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "20px 22px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#2e6da4", marginBottom: 8 }}>ContractIQ</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 8 }}>
            <div className="serif num" style={{ fontSize: 28, fontWeight: 600, color: "#16202e", letterSpacing: "-.5px" }}>{fmtUSD(totals.contractIqSavings)}</div>
            <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#eef1f6", color: "#5a7290", textTransform: "uppercase", letterSpacing: ".3px" }}>estimate</span>
          </div>
          <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
            {contract.annualStandardContracts.toLocaleString()} standard contracts a year; attorney and paralegal first-pass
            hours freed, with cycle compression at signing.
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "20px 22px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#2e6da4", marginBottom: 8 }}>BudgetIQ</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 8 }}>
            <div className="serif num" style={{ fontSize: 28, fontWeight: 600, color: "#16202e", letterSpacing: "-.5px" }}>{fmtUSD(totals.budgetIqSavings)}</div>
            <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#eef1f6", color: "#5a7290", textTransform: "uppercase", letterSpacing: ".3px" }}>estimate</span>
          </div>
          <div style={{ fontSize: 12, color: "#7a8493", lineHeight: 1.5 }}>
            Invoice {fmtUSD(invoice.totalSavings)} from auto-cleared matching and fewer reworks; accrual and reforecast{" "}
            {fmtUSD(finance.laborSavings)} from re-keying eliminated.
          </div>
        </div>
      </div>

      {/* Detail ledgers */}
      {showDetail && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Ledger
              title="ContractIQ, contract review"
              sub="Attorney and paralegal first-pass hours, cycle compression at signing"
              rows={contractAssumptions}
            />
            <Ledger
              title="BudgetIQ, invoice matching"
              sub="AP, approver, and rework hours across IT invoice volume"
              rows={invoiceAssumptions}
            />
            <Ledger
              title="BudgetIQ, financial planning"
              sub="Reforecast and accrual hours across the function leads"
              rows={financeAssumptions}
            />
          </div>

          <div style={{ marginTop: 18, fontSize: 11, color: "#9aa3b0", lineHeight: 1.6, maxWidth: 920 }}>
            Figures are synthetic, modeled from discovery, not real Iovance financials. Loaded labor rates are the only
            given inputs; hours count only when they convert to throughput. Dollars appear on this screen only; the working
            surfaces speak in hours, queues, findings, and throughput. Production stays modular.
          </div>
        </>
      )}
    </div>
  );
}
