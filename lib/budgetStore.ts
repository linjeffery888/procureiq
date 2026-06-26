// Disk-backed store of the LIVE vendor budget for BudgetIQ financial planning.
//
// The budget table is the basis every accrual draft and reforecast variance runs
// against. It used to be a hard-coded constant (BUDGET_LINES), so a planner could
// not bring their own budget: the demo always showed the same three synthetic
// lines. This store makes the budget ingestable and editable while keeping the
// seed visible so the demo is never empty.
//
// Two states, surfaced to the UI as BudgetSource:
//   - "seed":     no budget has been ingested; getLiveBudget returns the shipped
//                 synthetic BUDGET_LINES (a fresh copy, never the shared array).
//   - "ingested": the planner uploaded or edited a budget; the persisted lines in
//                 data/budget.json are authoritative and the seed is gone.
//
// Same persistence pattern as lib/budgetActualsStore / lib/uploadStore (atomic
// temp+rename write, single-process write lock). Demo persistence, not production
// architecture.

import fs from "fs/promises";
import path from "path";
import { VendorBudgetLine, BudgetSource } from "./types";
import { BUDGET_LINES } from "./mockData";
import { vendorKey } from "./budgetParse";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "budget.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

interface StoreFile {
  lines: VendorBudgetLine[];
  updatedAt: string | null;
}

// The budget the planning surface should render, plus where it came from.
export interface LiveBudget {
  lines: VendorBudgetLine[];
  source: BudgetSource;
  updatedAt: string | null;
}

export type WriteMode = "replace" | "append";

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Defensive coercion: a budget line read off disk must have the right shape (12
// month entries each) before it can drive the accrual math. Drops anything that
// cannot be made whole rather than letting a malformed row crash the planner.
function coerceLine(raw: unknown): VendorBudgetLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vendor = typeof r.vendor === "string" ? r.vendor.trim() : "";
  if (!vendor) return null;
  const twelve = (v: unknown): number[] => {
    const arr = Array.isArray(v) ? v : [];
    const out = new Array(12).fill(0).map((_, i) => {
      const n = Number(arr[i]);
      return Number.isFinite(n) ? n : 0;
    });
    return out;
  };
  const monthlyExpected = twelve(r.monthlyExpected);
  const actualsToDate = twelve(r.actualsToDate);
  const annual = Number(r.annualBudget);
  return {
    vendor,
    annualBudget: Number.isFinite(annual) ? annual : monthlyExpected.reduce((a, b) => a + b, 0),
    monthlyExpected,
    actualsToDate,
    paymentSchedule: typeof r.paymentSchedule === "string" ? r.paymentSchedule : "",
  };
}

// Read the persisted budget, or null when none has been ingested yet (so the
// caller knows to fall back to the seed).
async function readStore(): Promise<StoreFile | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    if (!Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines.map(coerceLine).filter((l): l is VendorBudgetLine => l !== null);
    if (lines.length === 0) return null;
    return { lines, updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null };
  } catch {
    return null;
  }
}

// Atomic write (temp + rename); safe to share one temp name because every write
// goes through withLock.
async function writeStore(store: StoreFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(TMP_PATH, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(TMP_PATH, STORE_PATH);
}

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// A fresh, independent copy of the shipped seed. Never hand back the shared
// BUDGET_LINES array: a caller that mutates a line (e.g. rolling an actual into
// actualsToDate) must not corrupt the module-level seed for the next request.
function seedCopy(): VendorBudgetLine[] {
  return BUDGET_LINES.map((l) => ({
    ...l,
    monthlyExpected: l.monthlyExpected.slice(),
    actualsToDate: l.actualsToDate.slice(),
  }));
}

// The budget to render: the persisted ingested budget if one exists, otherwise
// the synthetic seed. Read-only callers (the accrual + reforecast projections,
// the matching of an uploaded actual to a budget line) all start here.
export async function getLiveBudget(): Promise<LiveBudget> {
  const s = await readStore();
  if (s) return { lines: s.lines, source: "ingested", updatedAt: s.updatedAt };
  return { lines: seedCopy(), source: "seed", updatedAt: null };
}

// Merge incoming lines into a base set, keyed by normalized vendor. Existing
// vendors are updated in place (incoming wins); new vendors are appended in
// order. Used for "append" so an upload adds to whatever is currently live.
function mergeLines(base: VendorBudgetLine[], incoming: VendorBudgetLine[]): VendorBudgetLine[] {
  const result = base.map((l) => ({ ...l }));
  const indexByKey = new Map<string, number>();
  result.forEach((l, i) => indexByKey.set(vendorKey(l.vendor), i));
  for (const line of incoming) {
    const k = vendorKey(line.vendor);
    const at = indexByKey.get(k);
    if (at === undefined) {
      indexByKey.set(k, result.length);
      result.push({ ...line });
    } else {
      result[at] = { ...line };
    }
  }
  return result;
}

// Persist a budget. "replace" makes the given lines the entire budget; "append"
// unions them into the current live budget (seed or already-ingested), with
// incoming lines winning on a vendor collision. Either way the result is an
// "ingested" budget: once a planner brings their own numbers, the seed is gone.
// Returns the resulting LiveBudget so the route can echo it back.
export async function writeBudget(lines: VendorBudgetLine[], mode: WriteMode): Promise<LiveBudget> {
  return withLock(async () => {
    const clean = lines.map(coerceLine).filter((l): l is VendorBudgetLine => l !== null);
    let next: VendorBudgetLine[];
    if (mode === "append") {
      const current = await readStore();
      const base = current ? current.lines : seedCopy();
      next = mergeLines(base, clean);
    } else {
      next = clean;
    }
    const updatedAt = new Date().toISOString();
    await writeStore({ lines: next, updatedAt });
    return { lines: next, source: "ingested", updatedAt };
  });
}

// Update a single line in place by normalized vendor (inline edits from the
// planning page). No-op if the vendor is not in the live budget. Promotes a seed
// budget to ingested, because editing a number is bringing your own budget.
export async function updateBudgetLine(line: VendorBudgetLine): Promise<LiveBudget> {
  return withLock(async () => {
    const coerced = coerceLine(line);
    if (!coerced) return getLiveBudgetUnlocked();
    const current = await readStore();
    const base = current ? current.lines : seedCopy();
    const next = mergeLines(base, [coerced]);
    const updatedAt = new Date().toISOString();
    await writeStore({ lines: next, updatedAt });
    return { lines: next, source: "ingested", updatedAt };
  });
}

// Remove a line by normalized vendor. Promotes a seed budget to ingested.
export async function removeBudgetLine(vendor: string): Promise<LiveBudget> {
  return withLock(async () => {
    const key = vendorKey(vendor);
    const current = await readStore();
    const base = current ? current.lines : seedCopy();
    const next = base.filter((l) => vendorKey(l.vendor) !== key);
    const updatedAt = new Date().toISOString();
    await writeStore({ lines: next, updatedAt });
    return { lines: next, source: "ingested", updatedAt };
  });
}

// Drop the ingested budget and fall back to the shipped seed ("reset to sample").
export async function clearBudget(): Promise<LiveBudget> {
  return withLock(async () => {
    try {
      await fs.unlink(STORE_PATH);
    } catch {
      // already absent; nothing to clear.
    }
    return { lines: seedCopy(), source: "seed", updatedAt: null };
  });
}

// Read used inside an already-held lock (avoids re-entering withLock, which would
// deadlock on the single chain). Mirrors getLiveBudget.
async function getLiveBudgetUnlocked(): Promise<LiveBudget> {
  const s = await readStore();
  if (s) return { lines: s.lines, source: "ingested", updatedAt: s.updatedAt };
  return { lines: seedCopy(), source: "seed", updatedAt: null };
}
