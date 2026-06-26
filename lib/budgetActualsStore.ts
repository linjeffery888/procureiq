// Disk-backed store of uploaded finance actuals for BudgetIQ financial planning.
//
// The accrual drafts and the reforecast variance are deterministic projections:
// they recompute from the seeded budget lines, the committed ContractIQ records
// (persisted in recordStore), and the finance actuals a planner uploads. The
// first two already survive a restart; the uploaded actuals did not (client state
// only), so a planner had to re-upload the quarterly export every session. This
// persists each matched actual to data/budget-actuals.json so the whole planning
// surface holds across sessions.
//
// Upserts by normalized vendor (one actual per budget line; the latest upload
// wins), mirroring how the page keys actuals. Same persistence pattern as
// lib/uploadStore / lib/recordStore (atomic write + single-process write lock).
// Demo persistence, not production architecture.

import fs from "fs/promises";
import path from "path";
import { PersistedBudgetActual } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "budget-actuals.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

interface StoreFile {
  actuals: PersistedBudgetActual[];
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.actuals)) return { actuals: [] };
    return { actuals: parsed.actuals };
  } catch {
    return { actuals: [] };
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

export async function listBudgetActuals(): Promise<PersistedBudgetActual[]> {
  const s = await readStore();
  return s.actuals.slice();
}

// Upsert the given actuals by vendorKey (replace any existing entry for that
// vendor). Returns the full set.
export async function upsertBudgetActuals(entries: PersistedBudgetActual[]): Promise<PersistedBudgetActual[]> {
  return withLock(async () => {
    const s = await readStore();
    const byKey = new Map(s.actuals.map((a) => [a.vendorKey, a]));
    for (const e of entries) byKey.set(e.vendorKey, e);
    s.actuals = [...byKey.values()];
    await writeStore(s);
    return s.actuals.slice();
  });
}

export async function deleteBudgetActual(vendorKey: string): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    const next = s.actuals.filter((a) => a.vendorKey !== vendorKey);
    if (next.length !== s.actuals.length) {
      s.actuals = next;
      await writeStore(s);
    }
  });
}

export async function clearBudgetActuals(): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    s.actuals = [];
    await writeStore(s);
  });
}
