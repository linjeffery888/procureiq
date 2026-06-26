// Deterministic budget-table parser. Turns the text of an uploaded budget
// (a CSV or XLSX flattened to CSV by lib/extractText, or a pasted table) into the
// VendorBudgetLine rows the planner runs accruals and reforecast against. This is
// the budget-side analogue of lib/offlineExtraction: structured input deserves a
// rules parser, not a model call, so a clean spreadsheet is read exactly and
// without an API round-trip. The /api/ingest budget-plan path uses this first and
// only falls back to the model for unstructured (prose PDF) budgets.
//
// Pure: no fs, no network, no import from the server stores, so it is safe to run
// on either side. The column mapping is header-driven (it reads the header row to
// learn which column is the vendor, the annual budget, the month breakdown, and
// the payment schedule), so it tolerates real-world column order and naming.

import { VendorBudgetLine } from "./types";

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

// Canonical vendor key for de-duping and matching a budget line to an actual.
// Mirrors the normalizer used on the planning page and in matching.ts: lowercase,
// strip punctuation and common corporate suffixes, collapse whitespace.
export function vendorKey(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Split one line into cells. Prefers true CSV (handles quoted fields with embedded
// commas, the shape SheetJS emits), then tab-delimited, then a 2+ whitespace grid
// (a table pasted or extracted from a PDF). A single-column line returns one cell.
export function tokenizeRow(line: string): string[] {
  if (line.includes(",")) return parseCsvLine(line);
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (/\s{2,}/.test(line.trim())) return line.trim().split(/\s{2,}/).map((c) => c.trim());
  return [line.trim()];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// Parse a money / number cell. Strips currency symbols, thousands commas, and a
// parenthesized-negative convention. Returns null when there is no number.
export function parseMoney(cell: string | undefined): number | null {
  if (!cell) return null;
  const neg = /^\(.*\)$/.test(cell.trim());
  const cleaned = cell.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Spread an annual figure across 12 months as integers that sum back to it, so a
// budget given only as an annual number still drives the monthly accrual math.
export function spreadAnnual(annual: number): number[] {
  const base = Math.floor(annual / 12);
  const months = new Array(12).fill(base);
  let remainder = annual - base * 12;
  for (let i = 0; i < 12 && remainder > 0; i++) { months[i] += 1; remainder -= 1; }
  return months;
}

interface ColumnMap {
  vendor: number;
  annual: number | null;
  months: number[];      // 12 indices, or [] if no monthly columns
  schedule: number | null;
}

const VENDOR_RE = /\b(vendor|supplier|payee|counterpart|name)\b/i;
const ANNUAL_RE = /\b(annual|budget|total|fy\d*|year|amount|plan)\b/i;
const SCHEDULE_RE = /\b(schedule|cadence|terms|frequency|billing)\b/i;
const SKIP_VENDOR_RE = /^(total|subtotal|grand\s*total|sum|budget|period|fiscal|notes?)\b/i;

// Find the header row (the first row whose cells name a vendor column) and map
// each meaningful column to its index. Returns null when no header is found.
function mapColumns(rows: string[][]): { headerIndex: number; cols: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r];
    const vendorIdx = cells.findIndex((c) => VENDOR_RE.test(c));
    if (vendorIdx === -1) continue;

    const months: number[] = new Array(12).fill(-1);
    let annual: number | null = null;
    let schedule: number | null = null;
    cells.forEach((c, i) => {
      if (i === vendorIdx) return;
      const lc = c.toLowerCase();
      const monthHit = MONTH_KEYS.findIndex((m) => new RegExp(`\\b${m}`, "i").test(lc));
      if (monthHit !== -1 && months[monthHit] === -1) { months[monthHit] = i; return; }
      if (schedule === null && SCHEDULE_RE.test(c)) { schedule = i; return; }
      if (annual === null && ANNUAL_RE.test(c)) { annual = i; return; }
    });
    const monthCols = months.every((m) => m !== -1) ? months : [];
    return { headerIndex: r, cols: { vendor: vendorIdx, annual, months: monthCols, schedule } };
  }
  return null;
}

export interface BudgetParseResult {
  lines: VendorBudgetLine[];
  warnings: string[];
  headerFound: boolean;
}

// Parse a budget table into VendorBudgetLine rows. Header-driven so column order
// does not matter. Falls back to a "first text cell = vendor, largest number =
// annual" reading per row when no recognizable header is present, so a bare
// "Vendor, Amount" list still parses.
export function parseBudgetTable(text: string): BudgetParseResult {
  const warnings: string[] = [];
  const rawRows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("# Sheet:"))
    .map(tokenizeRow);
  if (rawRows.length === 0) return { lines: [], warnings: ["The document had no rows."], headerFound: false };

  const mapped = mapColumns(rawRows);
  const lines: VendorBudgetLine[] = [];
  const seen = new Set<string>();

  const pushLine = (vendor: string, annual: number, monthly: number[], schedule: string) => {
    const key = vendorKey(vendor);
    if (!key) return;
    if (seen.has(key)) { warnings.push(`Duplicate vendor "${vendor}" ignored (kept the first).`); return; }
    seen.add(key);
    lines.push({
      vendor,
      annualBudget: Math.round(annual),
      monthlyExpected: monthly.map((m) => Math.round(m)),
      actualsToDate: new Array(12).fill(0),
      paymentSchedule: schedule,
    });
  };

  if (mapped) {
    const { headerIndex, cols } = mapped;
    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const cells = rawRows[r];
      const vendor = (cells[cols.vendor] || "").trim();
      if (!vendor || SKIP_VENDOR_RE.test(vendor)) continue;

      let monthly: number[] = [];
      let annual: number | null = null;
      if (cols.months.length === 12) {
        monthly = cols.months.map((i) => parseMoney(cells[i]) ?? 0);
        annual = monthly.reduce((a, b) => a + b, 0);
        if (cols.annual !== null) {
          const stated = parseMoney(cells[cols.annual]);
          if (stated && stated > 0) annual = stated; // a stated annual wins over the month sum
        }
      } else if (cols.annual !== null) {
        annual = parseMoney(cells[cols.annual]);
        if (annual != null && annual > 0) monthly = spreadAnnual(annual);
      }

      if (annual == null || annual <= 0) { warnings.push(`Skipped "${vendor}": no budget amount found.`); continue; }
      const schedule = (cols.schedule !== null && cells[cols.schedule]?.trim())
        || `Monthly, $${Math.round(annual / 12).toLocaleString()}`;
      pushLine(vendor, annual, monthly, schedule);
    }
    return { lines, warnings, headerFound: true };
  }

  // No header: per-row, take the first non-numeric cell as the vendor and the
  // largest number as the annual budget. Tolerates a bare two-column list.
  for (const cells of rawRows) {
    const vendor = cells.find((c) => c && parseMoney(c) == null && /[a-z]/i.test(c));
    const nums = cells.map(parseMoney).filter((n): n is number => n != null && n > 0);
    if (!vendor || SKIP_VENDOR_RE.test(vendor) || nums.length === 0) continue;
    const annual = Math.max(...nums);
    pushLine(vendor, annual, spreadAnnual(annual), `Monthly, $${Math.round(annual / 12).toLocaleString()}`);
  }
  if (lines.length === 0) warnings.push("No vendor budget rows could be read. Expected a header row naming a vendor column and a budget amount.");
  return { lines, warnings, headerFound: false };
}

// --- Actuals tables: vendor + a single spent figure per row. ---------------
// Budget *plans* carry an annual and 12 monthly columns. Actuals are looser:
// Finance exports a list of "vendor, amount, (date)" rows, often a dump of
// loose invoices for the period. This reads that table deterministically, the
// same way parseBudgetTable reads the plan, so a CSV/XLSX of actuals lands
// without a model call. The ingest route falls back to its prose scanner when
// this returns nothing.

export interface ActualsLine { vendor: string; amount: number; period: string | null; }

// Header words that name the spent column, split strong vs weak so an
// unambiguous "Amount"/"Actual" beats a generic "Total" sitting in the same row.
const STRONG_AMOUNT_RE = /\b(amount|actual|actuals|spent|spend|paid|cost|charged|billed|value|gross|net)\b/i;
const WEAK_AMOUNT_RE = /\b(total|sum|invoiced|charge)\b/i;
// Columns that look numeric but are identifiers or dates, never the spent figure.
const ID_COL_RE = /\b(number|no\.?|#|id|date|po)\b/i;
// A cell that is itself a date, so a trailing "2026-06-03" is not read as money.
const DATE_CELL_RE = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-[a-z]{3,}-\d{2,4})\s*$/i;

export function parseActualsTable(text: string): ActualsLine[] {
  const cleaned = text.replace(/\r/g, "");
  const period = cleaned.match(/period\s*:?\s*([^\n]{3,40})/i)?.[1]?.trim() ?? null;
  const rows = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("# Sheet:"))
    .map(tokenizeRow);
  if (rows.length === 0) return [];

  const out: ActualsLine[] = [];
  const seen = new Set<string>();
  const push = (vendor: string, amount: number) => {
    const key = vendorKey(vendor);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ vendor, amount: Math.round(amount), period });
  };

  // Find a header row naming a vendor column and a spent column.
  let headerIndex = -1;
  let vendorIdx = -1;
  let amountIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r];
    const vIdx = cells.findIndex((c) => VENDOR_RE.test(c));
    if (vIdx === -1) continue;
    let aIdx = cells.findIndex((c, i) => i !== vIdx && !ID_COL_RE.test(c) && STRONG_AMOUNT_RE.test(c));
    if (aIdx === -1) aIdx = cells.findIndex((c, i) => i !== vIdx && !ID_COL_RE.test(c) && WEAK_AMOUNT_RE.test(c));
    if (aIdx === -1) continue;
    headerIndex = r; vendorIdx = vIdx; amountIdx = aIdx;
    break;
  }

  if (headerIndex !== -1) {
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = rows[r];
      const vendor = (cells[vendorIdx] || "").trim();
      if (!vendor || SKIP_VENDOR_RE.test(vendor)) continue;
      const amount = parseMoney(cells[amountIdx]);
      if (amount == null || amount <= 0) continue;
      push(vendor, amount);
    }
    return out;
  }

  // No header: the first text cell is the vendor and the spent figure is the
  // largest non-date number on the row, so a trailing ISO date is ignored.
  for (const cells of rows) {
    const vendor = cells.find((c) => c && parseMoney(c) == null && /[a-z]/i.test(c));
    if (!vendor || SKIP_VENDOR_RE.test(vendor)) continue;
    const nums = cells
      .filter((c) => !DATE_CELL_RE.test(c))
      .map(parseMoney)
      .filter((n): n is number => n != null && n > 0);
    if (nums.length === 0) continue;
    push(vendor, Math.max(...nums));
  }
  return out;
}
