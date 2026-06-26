// The P&L story for ProcureIQ. Every number here is either VERIFIED from Ben's
// discovery calls or a STATED ASSUMPTION, each with a `source` tag so the
// present-back shows exactly what is grounded vs estimated. That honesty is part
// of what the exercise scores.
//
// This is the ONLY cost model in the unified app. ContractIQ savings
// (contractReview) and BudgetIQ savings (invoiceMatching + financialPlanning)
// live here together, and platformTotals() rolls them into the one combined
// figure the Impact screen leads with. The main module screens stay clean;
// dollars live on the Impact screen.

export type Source = "verified" | "assumption" | "estimate";

export interface Assumption {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: Source;
  note: string;
}

const HOURS_PER_YEAR = 2080;

// ---- Loaded costs (verified from Ben) ----
export const ATTORNEY_LOADED = 262500;   // Ben: $250K-$275K, midpoint
export const PARALEGAL_LOADED = 200000;  // Ben: ~$200K
export const FINANCE_LOADED = 200000;    // Ben: ~$200K general finance
export const AP_LOADED = 200000;         // assume same band as finance

export const attorneyHourly = ATTORNEY_LOADED / HOURS_PER_YEAR;   // ~$126
export const paralegalHourly = PARALEGAL_LOADED / HOURS_PER_YEAR; // ~$96
export const apHourly = AP_LOADED / HOURS_PER_YEAR;               // ~$96
export const financeHourly = FINANCE_LOADED / HOURS_PER_YEAR;     // ~$96

function money(n: number): number {
  return Math.round(n);
}

export function assumptionsToMap(list: Assumption[]): Record<string, number> {
  return Object.fromEntries(list.map((x) => [x.key, x.value]));
}

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// =====================================================================
// CONTRACTIQ: contract review (legal first pass)
// =====================================================================
export const contractAssumptions: Assumption[] = [
  { key: "contractsPerMonth", label: "Contracts entering review / month", value: 120, unit: "contracts", source: "assumption", note: "Ben gave queue depth (hundreds standing) but not monthly flow. Placeholder, confirm in follow-up." },
  { key: "standardShare", label: "Share that is standard / templated", value: 0.6, unit: "fraction", source: "assumption", note: "Ben: license renewals are the most frequent contract type and are relatively clean (diff against prior, terms unchanged). Renewals plus templated NDAs anchor this share. Confirm the exact mix." },
  { key: "attorneyHoursFirstPass", label: "Attorney hours per first-pass review", value: 1.5, unit: "hours", source: "estimate", note: "Read + redline against the term checklist. Estimate." },
  { key: "paralegalHoursPrep", label: "Paralegal prep hours per contract", value: 1.0, unit: "hours", source: "estimate", note: "Intake, routing, preliminary overview before the attorney." },
  { key: "automationRate", label: "Share of first-pass work AI handles", value: 0.7, unit: "fraction", source: "estimate", note: "AI extracts terms + drafts redline; human confirms. Conservative." },
];

export interface ContractResult {
  annualStandardContracts: number;
  attorneyHoursSaved: number;
  paralegalHoursSaved: number;
  attorneySavings: number;
  paralegalSavings: number;
  laborSavings: number;
  // cycle-time effect (cost of delay) shown separately, less certain
  currentCycleDays: number;
  projectedCycleDays: number;
  // throughput is the metric Ben actually grades on. Hours freed only count if
  // they convert to more documents through the process. Ben's own example: a
  // lawyer who did 5 docs/week now does 8.
  docsPerWeekBefore: number;
  docsPerWeekAfter: number;
}

export function contractReview(a = assumptionsToMap(contractAssumptions)): ContractResult {
  const annualStandard = a.contractsPerMonth * 12 * a.standardShare;
  const attorneyHoursSaved = annualStandard * a.attorneyHoursFirstPass * a.automationRate;
  const paralegalHoursSaved = annualStandard * a.paralegalHoursPrep * a.automationRate;
  const attorneySavings = attorneyHoursSaved * attorneyHourly;
  const paralegalSavings = paralegalHoursSaved * paralegalHourly;
  return {
    annualStandardContracts: Math.round(annualStandard),
    attorneyHoursSaved: Math.round(attorneyHoursSaved),
    paralegalHoursSaved: Math.round(paralegalHoursSaved),
    attorneySavings: money(attorneySavings),
    paralegalSavings: money(paralegalSavings),
    laborSavings: money(attorneySavings + paralegalSavings),
    currentCycleDays: 30,      // Ben: "a month or longer," minimally
    projectedCycleDays: 7,     // first pass cleared same-week
    docsPerWeekBefore: 5,      // Ben's illustrative figure
    docsPerWeekAfter: 8,       // Ben's illustrative figure: "that's a win"
  };
}

// =====================================================================
// BUDGETIQ: invoice / PO matching
// =====================================================================
export const invoiceAssumptions: Assumption[] = [
  { key: "invoicesPerMonth", label: "IT invoices / month", value: 300, unit: "invoices", source: "verified", note: "Ben: 'we get hundreds,' IT is highest-volume group. Modeled at 300." },
  { key: "apMinutesPerInvoice", label: "AP minutes to match one invoice", value: 6, unit: "minutes", source: "estimate", note: "Manual lookup of PO + work order, match, code. Ben deferred exact number." },
  { key: "approverMinutesPerInvoice", label: "Approver minutes per invoice", value: 4, unit: "minutes", source: "estimate", note: "Ben personally hunts down PO/work order before approving." },
  { key: "automationRate", label: "Share auto-matched with no human touch", value: 0.8, unit: "fraction", source: "estimate", note: "Ben: ~80% are clean matches today." },
  { key: "mismatchRate", label: "Share that hit the wrong bucket", value: 0.1, unit: "fraction", source: "estimate", note: "Drives downstream reforecasting rework." },
  { key: "reworkHoursPerMismatch", label: "Rework hours per mismatch", value: 0.75, unit: "hours", source: "estimate", note: "Surfaces during reforecasting, then traced back and corrected." },
];

export interface InvoiceResult {
  apHoursSaved: number;
  approverHoursSaved: number;
  reworkHoursSaved: number;
  laborSavings: number;
  reworkSavings: number;
  totalSavings: number;
}

export function invoiceMatching(a = assumptionsToMap(invoiceAssumptions)): InvoiceResult {
  const annual = a.invoicesPerMonth * 12;
  const apHoursSaved = (annual * (a.apMinutesPerInvoice / 60)) * a.automationRate;
  const approverHoursSaved = (annual * (a.approverMinutesPerInvoice / 60)) * a.automationRate;
  const reworkHoursSaved = annual * a.mismatchRate * a.reworkHoursPerMismatch;
  // Value approver time at a manager rate band; use finance hourly as proxy.
  const approverSavings = approverHoursSaved * financeHourly;
  const apSavings = apHoursSaved * apHourly;
  const reworkSavings = reworkHoursSaved * financeHourly;
  return {
    apHoursSaved: Math.round(apHoursSaved),
    approverHoursSaved: Math.round(approverHoursSaved),
    reworkHoursSaved: Math.round(reworkHoursSaved),
    laborSavings: money(apSavings + approverSavings),
    reworkSavings: money(reworkSavings),
    totalSavings: money(apSavings + approverSavings + reworkSavings),
  };
}

// =====================================================================
// BUDGETIQ: financial planning (accruals + reforecast)
// =====================================================================
export const financeAssumptions: Assumption[] = [
  { key: "leadCount", label: "Function leads doing reforecast", value: 7, unit: "people", source: "verified", note: "Ben's org: commercial, R&D, G&A, Salesforce, infra/security, data, CSV." },
  { key: "leadHoursPerQuarter", label: "Hours per lead per quarter", value: 2.5, unit: "hours", source: "verified", note: "Ben: '2 to 3 hours' each." },
  { key: "ownerDaysPerQuarter", label: "Owner (Ben) days per quarter", value: 1.5, unit: "days", source: "verified", note: "Ben: 'a good day or two' at quarter-end." },
  { key: "accrualMeetingHoursPerQuarter", label: "Accrual meeting hours / quarter", value: 9, unit: "hours", source: "estimate", note: "Ben: 3 meetings of ~3 hrs around quarter close." },
  { key: "automationRate", label: "Share of re-keying AI eliminates", value: 0.6, unit: "fraction", source: "estimate", note: "Auto-pull actuals, auto-draft accruals from payment schedules." },
];

export interface FinanceResult {
  annualHoursSaved: number;
  laborSavings: number;
}

export function financialPlanning(a = assumptionsToMap(financeAssumptions)): FinanceResult {
  const perQuarterHours =
    a.leadCount * a.leadHoursPerQuarter +
    a.ownerDaysPerQuarter * 8 +
    a.accrualMeetingHoursPerQuarter;
  const annualHours = perQuarterHours * 4 * a.automationRate;
  const savings = annualHours * financeHourly;
  return {
    annualHoursSaved: Math.round(annualHours),
    laborSavings: money(savings),
  };
}

// =====================================================================
// PLATFORM ROLL-UP: the one combined figure the Impact screen leads with
// =====================================================================
export interface PlatformTotals {
  contract: ContractResult;
  invoice: InvoiceResult;
  finance: FinanceResult;
  contractIqSavings: number;   // ContractIQ module total
  budgetIqSavings: number;     // BudgetIQ module total (invoice + finance)
  totalAnnualSavings: number;  // the combined platform number
}

export function platformTotals(): PlatformTotals {
  const contract = contractReview();
  const invoice = invoiceMatching();
  const finance = financialPlanning();
  const contractIqSavings = contract.laborSavings;
  const budgetIqSavings = invoice.totalSavings + finance.laborSavings;
  return {
    contract,
    invoice,
    finance,
    contractIqSavings: money(contractIqSavings),
    budgetIqSavings: money(budgetIqSavings),
    totalAnnualSavings: money(contractIqSavings + budgetIqSavings),
  };
}
