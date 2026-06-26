// The ONE thing both modules touch: a shared store of committed
// ContractExtraction records. ContractIQ WRITES a record when the attorney
// commits a reviewed contract; BudgetIQ READS it as the invoice match key and
// the accrual basis. This is the data-layer unification made real at runtime,
// not just asserted on a slide.
//
// Deliberately the ONLY shared mutable state. The two modules' logic stays
// separate (ContractIQ owns extract + playbook, BudgetIQ owns matching + triage);
// they meet only here, on the record. That mirrors the production story: the
// deployment stays modular, each module integrates with its own system of record
// (Oro and the legal DMS for ContractIQ, Points Purchasing and finance for
// BudgetIQ), and the shared record flows between them as DATA. In production this
// store is that integration, not a single fused database.
//
// Persisted to disk (data/records.json) so a committed record survives a reload
// and a server restart: an attorney commits once and the handoff to BudgetIQ
// holds across sessions. Mirrors the lib/uploadStore / lib/corpus persistence
// pattern (atomic write + a single-process write lock). A demo convenience, not
// production architecture.

import fs from "fs/promises";
import path from "path";
import { ContractExtraction } from "./types";

export interface SharedRecord {
  id: string;
  vendor: string | null;
  extraction: ContractExtraction;
  sourceName: string;     // filename, sample name, or "pasted text"
  committedAt: string;    // ISO timestamp
  committedBy: string;    // human-in-the-loop marker, e.g. "attorney"
}

interface StoreFile {
  records: SharedRecord[];
  seq: number; // monotonic id source; ids stay unique across clears
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "records.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Read the store from disk. Records start empty (nothing to seed; they are
// produced only by an attorney committing a review). Missing or corrupt file
// starts empty.
async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.records)) return { records: [], seq: 0 };
    return { records: parsed.records, seq: typeof parsed.seq === "number" ? parsed.seq : parsed.records.length };
  } catch {
    return { records: [], seq: 0 };
  }
}

// Atomic write: write the temp file then rename over the store, so a reader never
// sees a half-written file. Safe to share one temp name because every write goes
// through withLock (no concurrent writers).
async function writeStore(store: StoreFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(TMP_PATH, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(TMP_PATH, STORE_PATH);
}

// Serialize all mutations so a concurrent commit cannot lose a write in a
// read-modify-write race. Each mutating op chains on the previous one.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Loose vendor normalization so "Helix Analytics, Inc." and "Helix Analytics"
// resolve to the same record. Kept local to avoid coupling to the matcher.
export function normalizeVendor(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Commit a reviewed extraction. Upserts by normalized vendor so re-committing the
// same vendor replaces the prior record rather than duplicating it.
export async function saveRecord(
  extraction: ContractExtraction,
  sourceName: string,
  committedBy = "attorney",
): Promise<SharedRecord> {
  return withLock(async () => {
    const s = await readStore();
    const norm = normalizeVendor(extraction.vendor);
    const now = new Date().toISOString();
    const existing = norm ? s.records.find((r) => normalizeVendor(r.vendor) === norm) : undefined;
    if (existing) {
      existing.extraction = extraction;
      existing.vendor = extraction.vendor;
      existing.sourceName = sourceName;
      existing.committedAt = now;
      existing.committedBy = committedBy;
      await writeStore(s);
      return existing;
    }
    s.seq += 1;
    const rec: SharedRecord = {
      id: `rec-${s.seq}`,
      vendor: extraction.vendor,
      extraction,
      sourceName,
      committedAt: now,
      committedBy,
    };
    s.records.push(rec);
    await writeStore(s);
    return rec;
  });
}

export async function listRecords(): Promise<SharedRecord[]> {
  const s = await readStore();
  return s.records.slice();
}

export async function getRecordByVendor(vendor: string | null | undefined): Promise<SharedRecord | null> {
  const norm = normalizeVendor(vendor);
  if (!norm) return null;
  const s = await readStore();
  return s.records.find((r) => normalizeVendor(r.vendor) === norm) ?? null;
}

export async function clearRecords(): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    s.records = [];
    await writeStore(s);
  });
}
